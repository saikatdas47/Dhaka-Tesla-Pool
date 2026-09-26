import {
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from "../services/emailOtpService.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

export const sendEmailOtp = asyncHandler(async (request, response) => {
  await sendRegistrationOtp(request.body?.role, request.body?.email);
  response.json(
    new ApiResponse(200, null, "A verification code was sent to your email."),
  );
});

export const verifyEmailOtp = asyncHandler(async (request, response) => {
  const registrationToken = await verifyRegistrationOtp(
    request.body?.role,
    request.body?.email,
    request.body?.otp,
  );
  response.json(
    new ApiResponse(
      200,
      { registrationToken },
      "Email verified. Complete registration within 10 minutes.",
    ),
  );
});
