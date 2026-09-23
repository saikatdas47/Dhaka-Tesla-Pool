import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    refreshTokenHash: { type: String, default: null, select: false },
    emailVerifiedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    pendingAvatarFilename: { type: String, default: null },
    licenseNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    licenseExpiry: { type: Date, required: true },
    vehicleModel: { type: String, required: true, enum: ["Model 3", "Model Y", "Model S", "Model X"] },
    vehicleRegistrationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    vehicleColor: { type: String, required: true, trim: true },
    passengerSeats: { type: Number, required: true, min: 1, max: 6 },
    serviceArea: { type: String, required: true, trim: true },
    verificationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

driverSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

driverSchema.methods.generateAccessToken = function () {
  return jwt.sign({ sub: this.id, role: "driver", tokenType: "access" }, process.env.AccessTokenSecret, {
    algorithm: "HS256",
    expiresIn: process.env.AccessTokenExpiresIn || "15m",
  });
};

driverSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ sub: this.id, role: "driver", tokenType: "refresh", nonce: randomUUID() }, process.env.RefreshTokenSecret, {
    algorithm: "HS256",
    expiresIn: process.env.RefreshTokenExpiresIn || "7d",
  });
};

export default mongoose.model("Driver", driverSchema);
