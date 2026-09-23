import test from "node:test";
import assert from "node:assert/strict";
import EmailOtp from "../models/EmailOtp.js";
import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";
import { sendRegistrationOtp, verifyRegistrationOtp, consumeRegistrationToken } from "../services/emailOtpService.js";

process.env.OTP_SECRET = "test-otp-secret-longer-than-sixteen-characters";

test("email OTP has cooldown, attempt limit, role binding, and one-use registration token", async () => {
  const originals = {
    findOne: EmailOtp.findOne,
    findOneAndUpdate: EmailOtp.findOneAndUpdate,
    updateOne: EmailOtp.updateOne,
    deleteOne: EmailOtp.deleteOne,
    findOneAndDelete: EmailOtp.findOneAndDelete,
    passengerExists: Passenger.exists,
    driverExists: Driver.exists,
  };
  let record = null;
  let sent;

  try {
    Passenger.exists = async () => false;
    Driver.exists = async () => false;
    EmailOtp.findOne = async ({ role, email }) => record?.role === role && record?.email === email ? record : null;
    EmailOtp.findOneAndUpdate = async (filter, update, options) => {
      if (options.upsert) {
        record = { _id: "otp-1", role: filter.role, email: filter.email, ...update.$set };
        return record;
      }
      if (!record || record.role !== filter.role || record.email !== filter.email || !record.otpHash || record.expiresAt <= new Date() || record.attempts >= 5) return null;
      record.attempts += update.$inc.attempts;
      return { ...record };
    };
    EmailOtp.updateOne = async (filter, update) => {
      if (!record || filter._id !== record._id || filter.otpHash !== record.otpHash) return { matchedCount: 0 };
      Object.assign(record, update.$set);
      return { matchedCount: 1 };
    };
    EmailOtp.deleteOne = async () => { record = null; return { deletedCount: 1 }; };
    EmailOtp.findOneAndDelete = async (filter) => {
      if (!record || filter.role !== record.role || filter.email !== record.email || filter.registrationTokenHash !== record.registrationTokenHash || record.expiresAt <= new Date()) return null;
      const used = record;
      record = null;
      return used;
    };

    await sendRegistrationOtp("passenger", "NUSRAT@example.com", async ({ email, otp }) => { sent = { email, otp }; });
    assert.equal(sent.email, "nusrat@example.com");
    assert.match(sent.otp, /^\d{6}$/);
    assert.notEqual(record.otpHash, sent.otp);
    await assert.rejects(sendRegistrationOtp("passenger", sent.email, async () => {}), { statusCode: 429 });
    await assert.rejects(verifyRegistrationOtp("driver", sent.email, sent.otp), { statusCode: 400 });
    await assert.rejects(verifyRegistrationOtp("passenger", sent.email, "000000"), { statusCode: 400 });

    const token = await verifyRegistrationOtp("passenger", sent.email, sent.otp);
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(record.otpHash, null);
    await consumeRegistrationToken("passenger", sent.email, token);
    await assert.rejects(consumeRegistrationToken("passenger", sent.email, token), { statusCode: 400 });

    await sendRegistrationOtp("passenger", sent.email, async ({ email, otp }) => { sent = { email, otp }; });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(verifyRegistrationOtp("passenger", sent.email, "000000"), { statusCode: attempt === 5 ? 429 : 400 });
    }
    await assert.rejects(verifyRegistrationOtp("passenger", sent.email, sent.otp), { statusCode: 400 });
  } finally {
    EmailOtp.findOne = originals.findOne;
    EmailOtp.findOneAndUpdate = originals.findOneAndUpdate;
    EmailOtp.updateOne = originals.updateOne;
    EmailOtp.deleteOne = originals.deleteOne;
    EmailOtp.findOneAndDelete = originals.findOneAndDelete;
    Passenger.exists = originals.passengerExists;
    Driver.exists = originals.driverExists;
  }
});
