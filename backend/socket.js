import { Server } from "socket.io";
import Passenger from "./models/Passenger.js";
import Driver from "./models/Driver.js";
import { verifyAccessToken } from "./services/sessionService.js";
import { accessCookieNames } from "./utils/tokenConfig.js";
import { demoAccountsEnabled } from "./config/demoAccounts.js";
import {
  chatAccess,
  chatRoom,
  chatSnapshot,
  sendRideMessage,
} from "./services/rideChatService.js";

function cookieValue(header = "", name) {
  for (const part of header.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.slice(name.length + 1));
    }
  }
  return null;
}

function message(error) {
  return error?.message || "Chat request failed.";
}

export function attachRideSockets(server, app) {
  const io = new Server(server, { maxHttpBufferSize: 2048 });
  app.locals.io = io;
  io.use(async (socket, next) => {
    try {
      if (!app.locals.databaseReady)
        throw new Error("Database is unavailable.");
      const role = socket.handshake.auth?.role;
      if (!["passenger", "driver"].includes(role))
        throw new Error("Choose Passenger or Driver.");
      const token =
        socket.handshake.auth?.accessToken ||
        cookieValue(socket.handshake.headers.cookie, accessCookieNames[role]);
      if (!token) throw new Error("Please sign in again.");
      const payload = verifyAccessToken(token, role);
      const account = await (role === "driver" ? Driver : Passenger).findById(
        payload.sub,
      );
      if (!account || (account.isDemo && !demoAccountsEnabled()))
        throw new Error("Account is unavailable.");
      socket.data.role = role;
      socket.data.accountId = account.id;
      socket.data.expiresAt = payload.exp * 1000;
      next();
    } catch (error) {
      next(new Error(message(error)));
    }
  });
  io.on("connection", (socket) => {
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, socket.data.expiresAt - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(expiryTimer));
    const authorized = () => {
      if (Date.now() >= socket.data.expiresAt)
        throw new Error("Session expired. Refresh and sign in again.");
      if (!app.locals.databaseReady)
        throw new Error("Database is unavailable.");
    };
    socket.on("chat:join", async ({ rideId } = {}, ack = () => {}) => {
      try {
        authorized();
        const result = await chatSnapshot(
          rideId,
          socket.data.role,
          socket.data.accountId,
        );
        await socket.join(chatRoom(rideId));
        ack({ ok: true, data: result });
      } catch (error) {
        ack({ ok: false, error: message(error) });
      }
    });
    socket.on("chat:send", async ({ rideId, text } = {}, ack = () => {}) => {
      try {
        authorized();
        if (!socket.rooms.has(chatRoom(rideId)))
          throw new Error("Join this ride chat first.");
        if (Date.now() - (socket.data.lastSentAt || 0) < 700)
          throw new Error("Please wait before sending another message.");
        const entry = await sendRideMessage(
          rideId,
          socket.data.role,
          socket.data.accountId,
          text,
        );
        socket.data.lastSentAt = Date.now();
        io.to(chatRoom(rideId)).emit("chat:message", entry);
        ack({ ok: true, data: entry });
      } catch (error) {
        ack({ ok: false, error: message(error) });
      }
    });
  });
  return io;
}
