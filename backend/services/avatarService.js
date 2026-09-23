import { open, unlink, access } from "node:fs/promises";
import path from "node:path";
import { uploadDirectory } from "../config/upload.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

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

export async function removeAccountAvatar(account, Model) {
  if (account.pendingAvatarFilename) throw new Error("Retry the saved image before removing the current photo.");
  if (!account.avatarPublicId) return account;
  const deleted = await deleteFromCloudinary(account.avatarPublicId);
  if (!["ok", "not found"].includes(deleted.result)) throw new Error("Cloudinary could not remove the photo.");
  const updated = await Model.findOneAndUpdate(
    { _id: account.id, avatarPublicId: account.avatarPublicId, pendingAvatarFilename: null },
    { $set: { avatarUrl: null, avatarPublicId: null } },
    { returnDocument: "after" }
  );
  if (!updated) throw new Error("Photo changed while it was being removed. Refresh and try again.");
  return updated;
}

export async function sendPendingAvatarToCloudinary(account, Model, role) {
  const filename = account.pendingAvatarFilename;
  const localPath = localAvatarPath(filename);

  await access(localPath);

  if (account.avatarPublicId) {
    const deleted = await deleteFromCloudinary(account.avatarPublicId);
    if (!["ok", "not found"].includes(deleted.result)) throw new Error("Old image could not be removed.");
    const cleared = await Model.updateOne(
      { _id: account.id, pendingAvatarFilename: filename, avatarPublicId: account.avatarPublicId },
      { $set: { avatarUrl: null, avatarPublicId: null } }
    );
    if (cleared.matchedCount !== 1) throw new Error("Avatar record changed during removal.");
  }
  const uploaded = await uploadOnCloudinary(localPath, account.id, role);
  if (!uploaded.secure_url || !uploaded.public_id) throw new Error("Cloudinary did not return an image URL.");

  const saved = await Model.updateOne(
    { _id: account.id, pendingAvatarFilename: filename },
    { $set: { avatarUrl: uploaded.secure_url, avatarPublicId: uploaded.public_id } }
  );
  if (saved.matchedCount !== 1) throw new Error("Pending image record changed during upload.");
  await removeLocalAvatar(filename);
  return Model.findOneAndUpdate(
    { _id: account.id, pendingAvatarFilename: filename },
    { $set: { pendingAvatarFilename: null } },
    { returnDocument: "after" }
  );
}
