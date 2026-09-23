import bcrypt from "bcryptjs";
import Driver from "../models/Driver.js";
import Passenger from "../models/Passenger.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { cleanAccountInput, cleanLoginInput } from "../utils/authInput.js";
import { startSession, refreshSession, endSession } from "../services/sessionService.js";
import { consumeRegistrationToken } from "../services/emailOtpService.js";
import { demoAccountsEnabled } from "../config/demoAccounts.js";
import { isRealImage, removeLocalAvatar, sendPendingAvatarToCloudinary } from "../services/avatarService.js";
import { clearAdminSession } from "../middlewares/admin.middleware.js";

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
    verificationStatus: driver.verificationStatus,
    avatarUrl: driver.avatarUrl || null,
    avatarPending: Boolean(driver.pendingAvatarFilename),
  };
}

function cleanDriverInput(body) {
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const phone = text(body.phone);
  const licenseNumber = text(body.licenseNumber).toUpperCase();
  const vehicleModel = text(body.vehicleModel);
  const vehicleRegistrationNumber = text(body.vehicleRegistrationNumber).toUpperCase();
  const vehicleColor = text(body.vehicleColor);
  const serviceArea = text(body.serviceArea);
  const passengerSeats = Number(body.passengerSeats);
  const licenseExpiry = text(body.licenseExpiry);

  if (!/^(?:\+8801|01)[3-9]\d{8}$/.test(phone)) throw new ApiError(400, "Enter a valid Bangladesh mobile number.");
  if (licenseNumber.length < 5 || licenseNumber.length > 40) throw new ApiError(400, "Enter a valid driving licence number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry) || Number.isNaN(Date.parse(licenseExpiry)) || new Date(`${licenseExpiry}T00:00:00Z`).toISOString().slice(0, 10) !== licenseExpiry) throw new ApiError(400, "Enter a valid licence expiry date.");
  const expiry = new Date(`${licenseExpiry}T23:59:59+06:00`);
  if (expiry <= new Date()) throw new ApiError(400, "Driving licence must not be expired.");
  if (!["Model 3", "Model Y", "Model S", "Model X"].includes(vehicleModel)) throw new ApiError(400, "Choose a Tesla model.");
  if (vehicleRegistrationNumber.length < 3 || vehicleRegistrationNumber.length > 40) throw new ApiError(400, "Enter a valid vehicle registration number.");
  if (vehicleColor.length < 2 || vehicleColor.length > 30) throw new ApiError(400, "Enter the vehicle color.");
  if (!Number.isInteger(passengerSeats) || passengerSeats < 1 || passengerSeats > 6) throw new ApiError(400, "Passenger seats must be between 1 and 6.");
  if (serviceArea.length < 2 || serviceArea.length > 80) throw new ApiError(400, "Enter your usual service area.");

  return { phone, licenseNumber, licenseExpiry: expiry, vehicleModel, vehicleRegistrationNumber, vehicleColor, passengerSeats, serviceArea };
}

export const registerDriver = asyncHandler(async (request, response) => {
  const { name, username, email, password } = cleanAccountInput(request.body);
  const driverDetails = cleanDriverInput(request.body);
  if (await Driver.exists({ $or: [{ email }, { username }, { licenseNumber: driverDetails.licenseNumber }, { vehicleRegistrationNumber: driverDetails.vehicleRegistrationNumber }] })) {
    throw new ApiError(409, "Driver email, username, licence, or vehicle registration is already in use.");
  }

  await consumeRegistrationToken("driver", email, request.body?.registrationToken);

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const driver = await Driver.create({ name, username, email, passwordHash, emailVerifiedAt: new Date(), ...driverDetails });
    await endSession(Passenger, "passenger", request, response);
    clearAdminSession(response);
    const accessToken = await startSession(Driver, driver, "driver", response);
    response.status(201).json(new ApiResponse(201, { driver: publicDriver(driver), accessToken }, "Driver registered successfully."));
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "Driver email, username, licence, or vehicle registration is already in use.");
    throw error;
  }
});

export const loginDriver = asyncHandler(async (request, response) => {
  const { identity, password } = cleanLoginInput(request.body);
  let driver = await Driver.findOne({ $or: [{ email: identity }, { username: identity }] }).select("+passwordHash");
  if (!driver && demoAccountsEnabled() && identity === "demo_driver") driver = await Driver.findOne({ isDemo: true }).select("+passwordHash");
  if (!driver || (driver.isDemo && !demoAccountsEnabled()) || !(await driver.comparePassword(password))) throw new ApiError(401, "Email/username or password is incorrect.");

  await endSession(Passenger, "passenger", request, response);
  clearAdminSession(response);
  const accessToken = await startSession(Driver, driver, "driver", response);
  response.json(new ApiResponse(200, { driver: publicDriver(driver), accessToken }, "Driver logged in successfully."));
});

export const refreshDriverToken = asyncHandler(async (request, response) => {
  const accessToken = await refreshSession(Driver, "driver", request, response);
  response.json(new ApiResponse(200, { accessToken }, "Access token refreshed."));
});

export const getCurrentDriver = asyncHandler(async (request, response) => {
  response.json(new ApiResponse(200, { driver: publicDriver(request.driver) }, "Current driver fetched successfully."));
});

export const updateDriverProfile = asyncHandler(async (request, response) => {
  const allowed = ["name", "phone", "licenseNumber", "licenseExpiry", "vehicleModel", "vehicleRegistrationNumber", "vehicleColor", "passengerSeats", "serviceArea"];
  if (Object.keys(request.body || {}).some((key) => !allowed.includes(key))) throw new ApiError(400, "Email and username cannot be edited.");
  const changes = Object.fromEntries(Object.entries(request.body || {}).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(changes).length) throw new ApiError(400, "No editable profile fields were provided.");
  const current = request.driver;
  const name = changes.name === undefined ? current.name : String(changes.name).trim();
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "Name must be 2 to 80 characters.");
  const details = cleanDriverInput({
    phone: current.phone,
    licenseNumber: current.licenseNumber,
    licenseExpiry: new Date(current.licenseExpiry.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
    vehicleModel: current.vehicleModel,
    vehicleRegistrationNumber: current.vehicleRegistrationNumber,
    vehicleColor: current.vehicleColor,
    passengerSeats: current.passengerSeats,
    serviceArea: current.serviceArea,
    ...changes,
  });
  const detailChanges = Object.fromEntries(Object.keys(changes).filter((key) => key !== "name").map((key) => [key, details[key]]));
  const verificationChanged = ["licenseNumber", "licenseExpiry", "vehicleModel", "vehicleRegistrationNumber", "vehicleColor", "passengerSeats"].some((key) =>
    key in detailChanges && (key === "licenseExpiry" ? detailChanges[key].getTime() !== current[key].getTime() : detailChanges[key] !== current[key])
  );
  try {
    const driver = await Driver.findByIdAndUpdate(current.id, {
      $set: { ...(changes.name !== undefined ? { name } : {}), ...detailChanges, ...(verificationChanged ? { verificationStatus: "pending" } : {}) },
    }, { returnDocument: "after", runValidators: true });
    response.json(new ApiResponse(200, { driver: publicDriver(driver) }, "Driver profile updated successfully."));
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "Driver licence or vehicle registration is already in use.");
    throw error;
  }
});

export const logoutDriver = asyncHandler(async (request, response) => {
  await endSession(Driver, "driver", request, response);
  await endSession(Passenger, "passenger", request, response);
  clearAdminSession(response);
  response.json(new ApiResponse(200, null, "Logged out."));
});

export const uploadDriverAvatar = asyncHandler(async (request, response) => {
  if (!request.file) throw new ApiError(400, "Choose an image in the avatar field.");
  const filename = request.file.filename;
  if (!(await isRealImage(request.file.path, request.file.mimetype))) {
    await removeLocalAvatar(filename);
    throw new ApiError(400, "The file content is not a valid image.");
  }
  const driver = await Driver.findOneAndUpdate(
    { _id: request.driver.id, pendingAvatarFilename: null },
    { $set: { pendingAvatarFilename: filename } },
    { returnDocument: "after" }
  );
  if (!driver) {
    await removeLocalAvatar(filename);
    throw new ApiError(409, "A previous image is waiting for retry. Retry it first.");
  }
  try {
    const updated = await sendPendingAvatarToCloudinary(driver, Driver, "driver");
    response.json(new ApiResponse(200, { driver: publicDriver(updated) }, "Avatar updated successfully."));
  } catch {
    response.status(502).json(new ApiResponse(502, { avatarPending: true }, "Cloudinary update failed. Your image is saved locally; try again."));
  }
});

export const retryDriverAvatar = asyncHandler(async (request, response) => {
  if (!request.driver.pendingAvatarFilename) throw new ApiError(409, "No image is waiting for retry.");
  try {
    const updated = await sendPendingAvatarToCloudinary(request.driver, Driver, "driver");
    response.json(new ApiResponse(200, { driver: publicDriver(updated) }, "Avatar updated successfully."));
  } catch (error) {
    if (error.code === "ENOENT") {
      await Driver.updateOne({ _id: request.driver.id, pendingAvatarFilename: request.driver.pendingAvatarFilename }, { $set: { pendingAvatarFilename: null } });
      throw new ApiError(410, "Saved image is no longer available. Choose it again.");
    }
    response.status(502).json(new ApiResponse(502, { avatarPending: true }, "Cloudinary update still failed. Your image remains saved for another retry."));
  }
});
