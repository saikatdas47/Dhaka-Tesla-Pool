import bcrypt from "bcryptjs";
import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";
import {
  isRealImage,
  removeAccountAvatar,
  removeLocalAvatar,
  sendPendingAvatarToCloudinary,
} from "../services/avatarService.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { cleanAccountInput, cleanLoginInput } from "../utils/authInput.js";
import {
  startSession,
  refreshSession,
  endSession,
} from "../services/sessionService.js";
import { consumeRegistrationToken } from "../services/emailOtpService.js";
import { demoAccountsEnabled } from "../config/demoAccounts.js";
import { clearAdminSession } from "../middlewares/admin.middleware.js";

function publicPassenger(passenger) {
  return {
    id: passenger.id,
    name: passenger.name,
    username: passenger.username || null,
    email: passenger.email,
    phone: passenger.phone || null,
    avatarUrl: passenger.avatarUrl || null,
    avatarPending: Boolean(passenger.pendingAvatarFilename),
  };
}

export const registerPassenger = asyncHandler(async (request, response) => {
  const { name, username, email, password } = cleanAccountInput(request.body);
  const phone =
    typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
  if (!/^(?:\+8801|01)[3-9]\d{8}$/.test(phone))
    throw new ApiError(400, "Enter a valid Bangladesh mobile number.");
  if (await Passenger.exists({ $or: [{ email }, { username }] }))
    throw new ApiError(409, "Passenger email or username is already in use.");

  await consumeRegistrationToken(
    "passenger",
    email,
    request.body?.registrationToken,
  );

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const passenger = await Passenger.create({
      name,
      username,
      email,
      phone,
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    await endSession(Driver, "driver", request, response);
    clearAdminSession(response);
    const accessToken = await startSession(
      Passenger,
      passenger,
      "passenger",
      response,
    );
    response
      .status(201)
      .json(
        new ApiResponse(
          201,
          { passenger: publicPassenger(passenger), accessToken },
          "Passenger registered successfully.",
        ),
      );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(409, "Passenger email or username is already in use.");
    throw error;
  }
});

export const loginPassenger = asyncHandler(async (request, response) => {
  const { identity, password } = cleanLoginInput(request.body);
  let passenger = await Passenger.findOne({
    $or: [{ email: identity }, { username: identity }],
  }).select("+passwordHash");
  if (
    !passenger ||
    (passenger.isDemo && !demoAccountsEnabled()) ||
    !(await passenger.comparePassword(password))
  )
    throw new ApiError(401, "Email/username or password is incorrect.");

  await endSession(Driver, "driver", request, response);
  clearAdminSession(response);
  const accessToken = await startSession(
    Passenger,
    passenger,
    "passenger",
    response,
  );
  response.json(
    new ApiResponse(
      200,
      { passenger: publicPassenger(passenger), accessToken },
      "Passenger logged in successfully.",
    ),
  );
});

export const refreshPassengerToken = asyncHandler(async (request, response) => {
  const accessToken = await refreshSession(
    Passenger,
    "passenger",
    request,
    response,
  );
  response.json(
    new ApiResponse(200, { accessToken }, "Access token refreshed."),
  );
});

export const getCurrentPassenger = asyncHandler(async (request, response) => {
  response.json(
    new ApiResponse(
      200,
      { passenger: publicPassenger(request.passenger) },
      "Current passenger fetched successfully.",
    ),
  );
});

export const updatePassengerProfile = asyncHandler(
  async (request, response) => {
    if (Object.keys(request.body || {}).some((key) => key !== "name"))
      throw new ApiError(400, "Only your name can be edited.");
    const name =
      typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (name.length < 2 || name.length > 80)
      throw new ApiError(400, "Name must be 2 to 80 characters.");
    const passenger = await Passenger.findByIdAndUpdate(
      request.passenger.id,
      { $set: { name } },
      { returnDocument: "after", runValidators: true },
    );
    response.json(
      new ApiResponse(
        200,
        { passenger: publicPassenger(passenger) },
        "Passenger profile updated successfully.",
      ),
    );
  },
);

export const logoutPassenger = asyncHandler(async (request, response) => {
  await endSession(Passenger, "passenger", request, response);
  await endSession(Driver, "driver", request, response);
  clearAdminSession(response);
  response.json(new ApiResponse(200, null, "Logged out."));
});

export const uploadPassengerAvatar = asyncHandler(async (request, response) => {
  if (!request.file)
    throw new ApiError(400, "Choose an image in the avatar field.");

  const filename = request.file.filename;
  if (!(await isRealImage(request.file.path, request.file.mimetype))) {
    await removeLocalAvatar(filename);
    throw new ApiError(400, "The file content is not a valid image.");
  }

  // Only one upload can claim the pending slot.
  const passenger = await Passenger.findOneAndUpdate(
    { _id: request.passenger.id, pendingAvatarFilename: null },
    { $set: { pendingAvatarFilename: filename } },
    { new: true },
  );
  if (!passenger) {
    await removeLocalAvatar(filename);
    throw new ApiError(
      409,
      "A previous image is waiting for retry. Retry it first.",
    );
  }

  try {
    const updated = await sendPendingAvatarToCloudinary(
      passenger,
      Passenger,
      "passenger",
    );
    response.json(
      new ApiResponse(
        200,
        { passenger: publicPassenger(updated) },
        "Avatar updated successfully.",
      ),
    );
  } catch {
    // Keep the local file and database filename so the passenger can retry.
    response
      .status(502)
      .json(
        new ApiResponse(
          502,
          { avatarPending: true },
          "Cloudinary upload failed. Your image is saved locally; try again.",
        ),
      );
  }
});

export const retryPassengerAvatar = asyncHandler(async (request, response) => {
  if (!request.passenger.pendingAvatarFilename)
    throw new ApiError(409, "No image is waiting for retry.");

  try {
    const updated = await sendPendingAvatarToCloudinary(
      request.passenger,
      Passenger,
      "passenger",
    );
    response.json(
      new ApiResponse(
        200,
        { passenger: publicPassenger(updated) },
        "Avatar updated successfully.",
      ),
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      await Passenger.updateOne(
        {
          _id: request.passenger.id,
          pendingAvatarFilename: request.passenger.pendingAvatarFilename,
        },
        { $set: { pendingAvatarFilename: null } },
      );
      throw new ApiError(
        410,
        "Saved image is no longer available. Choose it again.",
      );
    }
    response
      .status(502)
      .json(
        new ApiResponse(
          502,
          { avatarPending: true },
          "Upload still failed. Your image remains saved for another retry.",
        ),
      );
  }
});

export const removePassengerAvatar = asyncHandler(async (request, response) => {
  if (request.passenger.pendingAvatarFilename)
    throw new ApiError(
      409,
      "Retry the saved image before removing your photo.",
    );
  try {
    const passenger = await removeAccountAvatar(request.passenger, Passenger);
    response.json(
      new ApiResponse(
        200,
        { passenger: publicPassenger(passenger) },
        "Profile photo removed.",
      ),
    );
  } catch (error) {
    throw new ApiError(
      502,
      error.message || "Could not remove your photo. Try again.",
    );
  }
});
