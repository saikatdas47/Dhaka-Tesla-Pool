import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const passengerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, trim: true, lowercase: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    refreshTokenHash: { type: String, default: null, select: false },
    emailVerifiedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    pendingAvatarFilename: { type: String, default: null },
  },
  { timestamps: true }
);

// Existing passenger records may not have a username yet.
passengerSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } });

passengerSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

passengerSchema.methods.generateAccessToken = function () {
  return jwt.sign({ sub: this.id, role: "passenger", tokenType: "access" }, process.env.AccessTokenSecret, {
    algorithm: "HS256",
    expiresIn: process.env.AccessTokenExpiresIn || "15m",
  });
};

passengerSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ sub: this.id, role: "passenger", tokenType: "refresh", nonce: randomUUID() }, process.env.RefreshTokenSecret, {
    algorithm: "HS256",
    expiresIn: process.env.RefreshTokenExpiresIn || "7d",
  });
};

export default mongoose.model("Passenger", passengerSchema);
