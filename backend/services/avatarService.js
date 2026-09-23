import { open, unlink, access } from "node:fs/promises";
import path from "node:path";
import Passenger from "../models/Passenger.js";
import { uploadDirectory } from "../config/upload.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

function localAvatarPath(filename) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename || "")) {
    throw new Error("Invalid pending image filename.");
  }
  return path.join(uploadDirectory, filename);
}

// MIME types come from the browser; check the actual file bytes as well.
export async function isRealImage(filePath, mimeType) {
  const file = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(12);
    await file.read(bytes, 0, 12, 0);
    if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    return false;
  } finally {
    await file.close();
  }
}

export async function removeLocalAvatar(filename) {
  await unlink(localAvatarPath(filename));
}

export async function sendPendingAvatarToCloudinary(passenger) {
  const filename = passenger.pendingAvatarFilename;
  const localPath = localAvatarPath(filename);

  await access(localPath);

  // The fixed public ID makes a retry overwrite the same remote image.
  const uploaded = await uploadOnCloudinary(localPath, passenger.id);
  if (!uploaded.secure_url || !uploaded.public_id) throw new Error("Cloudinary did not return an image URL.");

  const saved = await Passenger.updateOne(
    { _id: passenger.id, pendingAvatarFilename: filename },
    { $set: { avatarUrl: uploaded.secure_url, avatarPublicId: uploaded.public_id } }
  );
  if (saved.matchedCount !== 1) throw new Error("Pending image record changed during upload.");
  await removeLocalAvatar(filename);
  return Passenger.findOneAndUpdate(
    { _id: passenger.id, pendingAvatarFilename: filename },
    { $set: { pendingAvatarFilename: null } },
    { new: true }
  );
}
