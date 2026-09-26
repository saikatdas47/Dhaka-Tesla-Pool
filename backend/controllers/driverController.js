import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Driver from "../models/Driver.js";
import Passenger from "../models/Passenger.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { cleanAccountInput, cleanLoginInput } from "../utils/authInput.js";
import {
  startSession,
  refreshSession,
  endSession,
  verifyAccessToken,
} from "../services/sessionService.js";
import { consumeRegistrationToken } from "../services/emailOtpService.js";
import { demoAccountsEnabled } from "../config/demoAccounts.js";
import {
  isRealImage,
  removeAccountAvatar,
  removeLocalAvatar,
  sendPendingAvatarToCloudinary,
} from "../services/avatarService.js";
import { clearAdminSession } from "../middlewares/admin.middleware.js";
import { requireArea } from "../utils/rideRules.js";
import Pool from "../models/Pool.js";

function publicDriver(driver) {
  return {
    id: driver.id,
    name: driver.name,
    username: driver.username,
    email: driver.email,
    phone: driver.phone,
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    vehicleModel: driver.vehicleModel,
    vehicleRegistrationNumber: driver.vehicleRegistrationNumber,
    vehicleColor: driver.vehicleColor,
    passengerSeats: driver.passengerSeats,
    serviceArea: driver.serviceArea,
    availability: driver.availability || "offline",
    currentArea: driver.currentArea || null,
    locationSource: driver.locationSource || "manual",
    locationUpdatedAt: driver.locationUpdatedAt || null,
    verificationStatus: driver.verificationStatus,
    avatarUrl: driver.avatarUrl || null,
    avatarPending: Boolean(driver.pendingAvatarFilename),
  };
}

function cleanDriverInput(body) {
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  const phone = text(body.phone);
  const licenseNumber = text(body.licenseNumber).toUpperCase();
  const vehicleModel = text(body.vehicleModel);
  const vehicleRegistrationNumber = text(
    body.vehicleRegistrationNumber,
  ).toUpperCase();
  const vehicleColor = text(body.vehicleColor);
  const serviceArea = text(body.serviceArea);
  const passengerSeats = Number(body.passengerSeats);
  const licenseExpiry = text(body.licenseExpiry);

  if (!/^(?:\+8801|01)[3-9]\d{8}$/.test(phone))
    throw new ApiError(400, "Enter a valid Bangladesh mobile number.");
  if (licenseNumber.length < 5 || licenseNumber.length > 40)
    throw new ApiError(400, "Enter a valid driving licence number.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry) ||
    Number.isNaN(Date.parse(licenseExpiry)) ||
    new Date(`${licenseExpiry}T00:00:00Z`).toISOString().slice(0, 10) !==
      licenseExpiry
  )
    throw new ApiError(400, "Enter a valid licence expiry date.");
  const expiry = new Date(`${licenseExpiry}T23:59:59+06:00`);
  if (expiry <= new Date())
    throw new ApiError(400, "Driving licence must not be expired.");
  if (!["Model 3", "Model Y", "Model S", "Model X"].includes(vehicleModel))
    throw new ApiError(400, "Choose a Tesla model.");
  if (
    vehicleRegistrationNumber.length < 3 ||
    vehicleRegistrationNumber.length > 40
  )
    throw new ApiError(400, "Enter a valid vehicle registration number.");
  if (vehicleColor.length < 2 || vehicleColor.length > 30)
    throw new ApiError(400, "Enter the vehicle color.");
  if (
    !Number.isInteger(passengerSeats) ||
    passengerSeats < 2 ||
    passengerSeats > 4
  )
    throw new ApiError(400, "Passenger seats must be between 2 and 4.");
  if (serviceArea.length < 2 || serviceArea.length > 80)
    throw new ApiError(400, "Enter your usual service area.");

  return {
    phone,
    licenseNumber,
    licenseExpiry: expiry,
    vehicleModel,
    vehicleRegistrationNumber,
    vehicleColor,
    passengerSeats,
    serviceArea,
  };
}

export const registerDriver = asyncHandler(async (request, response) => {
  const { name, username, email, password } = cleanAccountInput(request.body);
  const driverDetails = cleanDriverInput(request.body);
  if (
    await Driver.exists({
      $or: [
        { email },
        { username },
        { licenseNumber: driverDetails.licenseNumber },
        { vehicleRegistrationNumber: driverDetails.vehicleRegistrationNumber },
      ],
    })
  ) {
    throw new ApiError(
      409,
      "Driver email, username, licence, or vehicle registration is already in use.",
    );
  }

  await consumeRegistrationToken(
    "driver",
    email,
    request.body?.registrationToken,
  );

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const driver = await Driver.create({
      name,
      username,
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
      ...driverDetails,
      verificationHistory: [
        { status: "pending", at: new Date(), by: "driver registration" },
      ],
    });
    await endSession(Passenger, "passenger", request, response);
    clearAdminSession(response);
    const accessToken = await startSession(Driver, driver, "driver", response);
    response
      .status(201)
      .json(
        new ApiResponse(
          201,
          { driver: publicDriver(driver), accessToken },
          "Driver registered successfully.",
        ),
      );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(
        409,
        "Driver email, username, licence, or vehicle registration is already in use.",
      );
    throw error;
  }
});

export const loginDriver = asyncHandler(async (request, response) => {
  const { identity, password } = cleanLoginInput(request.body);
  let driver = await Driver.findOne({
    $or: [{ email: identity }, { username: identity }],
  }).select("+passwordHash");
  if (
    !driver ||
    (driver.isDemo && !demoAccountsEnabled()) ||
    !(await driver.comparePassword(password))
  )
    throw new ApiError(401, "Email/username or password is incorrect.");

  await endSession(Passenger, "passenger", request, response);
  clearAdminSession(response);
  const accessToken = await startSession(Driver, driver, "driver", response);
  response.json(
    new ApiResponse(
      200,
      { driver: publicDriver(driver), accessToken },
      "Driver logged in successfully.",
    ),
  );
});

export const refreshDriverToken = asyncHandler(async (request, response) => {
  const accessToken = await refreshSession(Driver, "driver", request, response);
  response.json(
    new ApiResponse(200, { accessToken }, "Access token refreshed."),
  );
});

export const getCurrentDriver = asyncHandler(async (request, response) => {
  response.json(
    new ApiResponse(
      200,
      { driver: publicDriver(request.driver) },
      "Current driver fetched successfully.",
    ),
  );
});

export const updateDriverProfile = asyncHandler(async (request, response) => {
  const allowed = [
    "name",
    "phone",
    "licenseNumber",
    "licenseExpiry",
    "vehicleModel",
    "vehicleRegistrationNumber",
    "vehicleColor",
    "passengerSeats",
    "serviceArea",
  ];
  if (Object.keys(request.body || {}).some((key) => !allowed.includes(key)))
    throw new ApiError(400, "Email and username cannot be edited.");
  const changes = {};
  for (const key of Object.keys(request.body || {})) {
    changes[key] = request.body[key];
  }
  if (!Object.keys(changes).length)
    throw new ApiError(400, "No editable profile fields were provided.");
  const current = request.driver;
  if (
    changes.passengerSeats !== undefined &&
    (await Pool.exists({
      driver: current.id,
      status: { $in: ["MATCHED", "DRIVER_ARRIVED", "STARTED"] },
    }))
  ) {
    throw new ApiError(
      409,
      "Finish the active ride before changing seat capacity.",
    );
  }
  const name =
    changes.name === undefined ? current.name : String(changes.name).trim();
  if (name.length < 2 || name.length > 80)
    throw new ApiError(400, "Name must be 2 to 80 characters.");
  const details = cleanDriverInput({
    phone: current.phone,
    licenseNumber: current.licenseNumber,
    licenseExpiry: new Date(
      current.licenseExpiry.getTime() + 6 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10),
    vehicleModel: current.vehicleModel,
    vehicleRegistrationNumber: current.vehicleRegistrationNumber,
    vehicleColor: current.vehicleColor,
    passengerSeats: current.passengerSeats,
    serviceArea: current.serviceArea,
    ...changes,
  });
  const detailChanges = {};
  for (const key of Object.keys(changes)) {
    if (key !== "name") detailChanges[key] = details[key];
  }
  let verificationChanged = false;
  const verificationFields = [
    "licenseNumber",
    "licenseExpiry",
    "vehicleModel",
    "vehicleRegistrationNumber",
    "vehicleColor",
    "passengerSeats",
  ];
  for (const key of verificationFields) {
    if (!(key in detailChanges)) continue;
    let oldValue = current[key];
    let newValue = detailChanges[key];
    if (key === "licenseExpiry") {
      oldValue = oldValue.getTime();
      newValue = newValue.getTime();
    }
    if (newValue !== oldValue) verificationChanged = true;
  }
  const update = { $set: detailChanges };
  if (changes.name !== undefined) update.$set.name = name;
  if (verificationChanged) {
    update.$set.verificationStatus = "pending";
    update.$set.availability = "offline";
    if (current.verificationStatus !== "pending") {
      update.$push = {
        verificationHistory: {
          status: "pending",
          at: new Date(),
          by: "driver profile update",
        },
      };
    }
  }
  try {
    const driver = await Driver.findByIdAndUpdate(current.id, update, {
      returnDocument: "after",
      runValidators: true,
    });
    response.json(
      new ApiResponse(
        200,
        { driver: publicDriver(driver) },
        "Driver profile updated successfully.",
      ),
    );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(
        409,
        "Driver licence or vehicle registration is already in use.",
      );
    throw error;
  }
});

export const updateDriverAvailability = asyncHandler(
  async (request, response) => {
    const { availability, currentArea } = request.body || {};
    for (const key of Object.keys(request.body || {})) {
      if (!["availability", "currentArea"].includes(key))
        throw new ApiError(
          400,
          "Only initial area and availability can be selected.",
        );
    }
    if (!["online", "offline"].includes(availability))
      throw new ApiError(400, "Choose online or offline.");
    const session = await mongoose.startSession();
    let driver;
    try {
      await session.withTransaction(async () => {
        const locked = await Driver.findOneAndUpdate(
          { _id: request.driver.id },
          { $set: { lastOfferAcceptedAt: new Date() } },
          { session, returnDocument: "after" },
        );
        const pool = await Pool.findOne({
          driver: locked.id,
          status: { $in: ["MATCHED", "DRIVER_ARRIVED", "STARTED"] },
        }).session(session);
        if (pool && availability === "offline")
          throw new ApiError(
            409,
            "Finish accepted bookings before going offline.",
          );
        if (
          pool &&
          currentArea !== undefined &&
          currentArea !== locked.currentArea
        )
          throw new ApiError(
            409,
            "During a trip, pickup/drop-off actions update location automatically.",
          );
        const area =
          currentArea === undefined
            ? locked.currentArea
            : requireArea(currentArea);
        if (availability === "online") {
          if (!area) throw new ApiError(400, "Choose your starting area.");
          if (
            locked.verificationStatus !== "approved" ||
            new Date(locked.licenseExpiry) <= new Date()
          )
            throw new ApiError(
              403,
              "Admin approval and valid licence are required.",
            );
        }
        driver = await Driver.findByIdAndUpdate(
          locked.id,
          {
            $set: {
              availability,
              currentArea: area,
              locationSource: pool ? locked.locationSource : "manual",
              locationUpdatedAt: new Date(),
            },
          },
          { session, returnDocument: "after", runValidators: true },
        );
      });
    } finally {
      await session.endSession();
    }
    response.json(
      new ApiResponse(
        200,
        { driver: publicDriver(driver) },
        "Availability updated.",
      ),
    );
  },
);

export const logoutDriver = asyncHandler(async (request, response) => {
  // A signed-out driver must not keep receiving new ride offers.
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : request.cookies?.tesla_pool_driver_session;
  if (token) {
    try {
      const payload = verifyAccessToken(token, "driver");
      await Driver.updateOne(
        { _id: payload.sub },
        { $set: { availability: "offline" } },
      );
    } catch {
      /* Expired sessions still clear their cookies below. */
    }
  }
  await endSession(Driver, "driver", request, response);
  await endSession(Passenger, "passenger", request, response);
  clearAdminSession(response);
  response.json(new ApiResponse(200, null, "Logged out."));
});

export const uploadDriverAvatar = asyncHandler(async (request, response) => {
  if (!request.file)
    throw new ApiError(400, "Choose an image in the avatar field.");
  const filename = request.file.filename;
  if (!(await isRealImage(request.file.path, request.file.mimetype))) {
    await removeLocalAvatar(filename);
    throw new ApiError(400, "The file content is not a valid image.");
  }
  const driver = await Driver.findOneAndUpdate(
    { _id: request.driver.id, pendingAvatarFilename: null },
    { $set: { pendingAvatarFilename: filename } },
    { returnDocument: "after" },
  );
  if (!driver) {
    await removeLocalAvatar(filename);
    throw new ApiError(
      409,
      "A previous image is waiting for retry. Retry it first.",
    );
  }
  try {
    const updated = await sendPendingAvatarToCloudinary(
      driver,
      Driver,
      "driver",
    );
    response.json(
      new ApiResponse(
        200,
        { driver: publicDriver(updated) },
        "Avatar updated successfully.",
      ),
    );
  } catch {
    response
      .status(502)
      .json(
        new ApiResponse(
          502,
          { avatarPending: true },
          "Cloudinary update failed. Your image is saved locally; try again.",
        ),
      );
  }
});

export const retryDriverAvatar = asyncHandler(async (request, response) => {
  if (!request.driver.pendingAvatarFilename)
    throw new ApiError(409, "No image is waiting for retry.");
  try {
    const updated = await sendPendingAvatarToCloudinary(
      request.driver,
      Driver,
      "driver",
    );
    response.json(
      new ApiResponse(
        200,
        { driver: publicDriver(updated) },
        "Avatar updated successfully.",
      ),
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      await Driver.updateOne(
        {
          _id: request.driver.id,
          pendingAvatarFilename: request.driver.pendingAvatarFilename,
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
          "Cloudinary update still failed. Your image remains saved for another retry.",
        ),
      );
  }
});

export const removeDriverAvatar = asyncHandler(async (request, response) => {
  if (request.driver.pendingAvatarFilename)
    throw new ApiError(
      409,
      "Retry the saved image before removing your photo.",
    );
  try {
    const driver = await removeAccountAvatar(request.driver, Driver);
    response.json(
      new ApiResponse(
        200,
        { driver: publicDriver(driver) },
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
