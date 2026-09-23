import mongoose from "mongoose";

const emailOtpSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ["passenger", "driver"] },
  email: { type: String, required: true, lowercase: true, trim: true },
  otpHash: { type: String, default: null },
  registrationTokenHash: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
});

emailOtpSchema.index({ role: 1, email: 1 }, { unique: true });
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("EmailOtp", emailOtpSchema);
