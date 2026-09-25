import mongoose from "mongoose";
import RideChat from "../models/RideChat.js";
import RideRequest from "../models/RideRequest.js";
import { ApiError } from "../utils/apiError.js";

export const chatRoom = (rideId) => `ride:${rideId}`;

export async function chatAccess(rideId, role, accountId) {
  if (!mongoose.isValidObjectId(rideId)) throw new ApiError(400, "Invalid ride ID.");
  const ride = await RideRequest.findById(rideId).populate("pool", "driver status");
  if (!ride) throw new ApiError(404, "Ride not found.");
  const allowed = role === "passenger" ? String(ride.passenger) === String(accountId) : role === "driver" && String(ride.pool?.driver) === String(accountId);
  if (!allowed) throw new ApiError(404, "Ride not found for this account.");
  if (ride.status !== "MATCHED" || ride.pool?.status !== "MATCHED") throw new ApiError(409, "Chat is available only until the driver arrives.");
  return ride;
}

export async function openRideChat(ride, pool, session) {
  await RideChat.updateOne({ ride: ride.id }, { $setOnInsert: {
    ride: ride.id, pool: pool.id, passenger: ride.passenger, driver: pool.driver,
    status: "open", messages: [], expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  } }, { upsert: true, session });
}

export async function chatSnapshot(rideId, role, accountId) {
  await chatAccess(rideId, role, accountId);
  const chat = await RideChat.findOne({ ride: rideId, status: "open", expiresAt: { $gt: new Date() } });
  if (!chat) throw new ApiError(410, "This chat has expired.");
  return { rideId, messages: chat.messages.map((message) => ({ id: message.id, senderRole: message.senderRole, text: message.text, sentAt: message.sentAt })) };
}

export async function sendRideMessage(rideId, role, accountId, input) {
  await chatAccess(rideId, role, accountId);
  const text = typeof input === "string" ? input.trim() : "";
  if (!text || text.length > 500) throw new ApiError(400, "Message must be 1–500 characters.");
  const sentAt = new Date();
  const chat = await RideChat.findOneAndUpdate(
    { ride: rideId, status: "open", expiresAt: { $gt: sentAt }, $expr: { $lt: [{ $size: "$messages" }, 200] } },
    { $push: { messages: { senderRole: role, sender: accountId, text, sentAt } } },
    { returnDocument: "after" }
  );
  if (!chat) throw new ApiError(409, "Chat is closed or full.");
  const message = chat.messages.at(-1);
  return { id: message.id, senderRole: message.senderRole, text: message.text, sentAt: message.sentAt };
}

export function notifyChatClosed(io, rideIds) {
  if (!io) return;
  for (const rideId of rideIds) {
    io.to(chatRoom(rideId)).emit("chat:closed");
    io.in(chatRoom(rideId)).socketsLeave(chatRoom(rideId));
  }
}
