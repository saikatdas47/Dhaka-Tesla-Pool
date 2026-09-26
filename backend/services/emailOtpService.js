import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import EmailOtp from "../models/EmailOtp.js";
import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";
import { ApiError } from "../utils/apiError.js";
import { sendOtpEmail } from "../utils/mailer.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const REGISTRATION_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function accountModel(role) {
  if (role === "passenger") return Passenger;
  if (role === "driver") return Driver;
  throw new ApiError(400, "Choose Passenger or Driver.");
}

function cleanEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(400, "Enter a valid email address.");
  return email;
}

function otpHash(role, email, otp) {
  return createHmac("sha256", process.env.OTP_SECRET)
    .update(`${role}:${email}:${otp}`)
    .digest("hex");
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendRegistrationOtp(role, value, mail = sendOtpEmail) {
  const Model = accountModel(role);
  const email = cleanEmail(value);
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 16)
    throw new ApiError(503, "Email verification is not configured.");
  if (await Model.exists({ email }))
    throw new ApiError(
      409,
      "An account with this email already exists for the selected role.",
    );

  const now = new Date();
  const existing = await EmailOtp.findOne({ role, email });
  if (existing && now - existing.sentAt < RESEND_COOLDOWN_MS)
    throw new ApiError(
      429,
      "Please wait one minute before requesting another code.",
    );

  const otp = String(randomInt(100000, 1000000));
  const hash = otpHash(role, email, otp);
  try {
    await EmailOtp.findOneAndUpdate(
      { role, email },
      {
        $set: {
          otpHash: hash,
          registrationTokenHash: null,
          sentAt: now,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          attempts: 0,
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(429, "Please wait before requesting another code.");
    throw error;
  }

  try {
    await mail({ email, otp });
  } catch {
    await EmailOtp.deleteOne({ role, email, otpHash: hash });
    throw new ApiError(502, "Email could not be sent. Please try again.");
  }
}

export async function verifyRegistrationOtp(role, value, valueOtp) {
  accountModel(role);
  const email = cleanEmail(value);
  const otp = typeof valueOtp === "string" ? valueOtp.trim() : "";
  if (!/^\d{6}$/.test(otp))
    throw new ApiError(400, "Enter a six-digit verification code.");

  const record = await EmailOtp.findOneAndUpdate(
    {
      role,
      email,
      otpHash: { $ne: null },
      expiresAt: { $gt: new Date() },
      attempts: { $lt: MAX_VERIFY_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!record)
    throw new ApiError(
      400,
      "Code expired or too many attempts. Request a new code.",
    );

  const expected = Buffer.from(record.otpHash, "hex");
  const received = Buffer.from(otpHash(role, email, otp), "hex");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    if (record.attempts >= MAX_VERIFY_ATTEMPTS)
      await EmailOtp.deleteOne({ _id: record._id });
    throw new ApiError(
      record.attempts >= MAX_VERIFY_ATTEMPTS ? 429 : 400,
      "The verification code is incorrect.",
    );
  }

  const registrationToken = randomBytes(32).toString("hex");
  const updated = await EmailOtp.updateOne(
    { _id: record._id, otpHash: record.otpHash, registrationTokenHash: null },
    {
      $set: {
        otpHash: null,
        registrationTokenHash: tokenHash(registrationToken),
        expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS),
      },
    },
  );
  if (updated.matchedCount !== 1)
    throw new ApiError(409, "Code was already used. Request a new code.");
  return registrationToken;
}

export async function consumeRegistrationToken(role, value, token) {
  accountModel(role);
  const email = cleanEmail(value);
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(400, "Verify your email before creating an account.");
  const record = await EmailOtp.findOneAndDelete({
    role,
    email,
    registrationTokenHash: tokenHash(token),
    expiresAt: { $gt: new Date() },
  });
  if (!record)
    throw new ApiError(
      400,
      "Email verification expired or was already used. Request a new code.",
    );
}
