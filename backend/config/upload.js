import path from "node:path";

export const uploadDirectory = path.resolve(
  process.env.UPLOAD_DIR || "uploads",
);
