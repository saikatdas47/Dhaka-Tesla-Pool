import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { uploadDirectory } from "../config/upload.js";
import { ApiError } from "../utils/apiError.js";

const extensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, done) => done(null, uploadDirectory),
  filename: (_request, file, done) => done(null, `${randomUUID()}${extensions[file.mimetype]}`),
});

export const uploadAvatarFile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, done) => {
    if (!extensions[file.mimetype]) {
      return done(new ApiError(400, "Upload a JPG, PNG, or WebP image."));
    }
    done(null, true);
  },
}).single("avatar");
