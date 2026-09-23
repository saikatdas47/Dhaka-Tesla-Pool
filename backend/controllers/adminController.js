import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import Passenger from "../models/Passenger.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { checkAdminCredentials, clearAdminSession, setAdminSession } from "../middlewares/admin.middleware.js";
import { endSession } from "../services/sessionService.js";

function reviewDriver(driver) {
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
    serviceArea: driver.serviceArea,
    verificationStatus: driver.verificationStatus,
  };
}

export const loginAdmin = asyncHandler(async (request, response) => {
  if (!checkAdminCredentials(request.body?.username, request.body?.password)) throw new ApiError(401, "Admin username or password is incorrect.");
  await endSession(Passenger, "passenger", request, response);
  await endSession(Driver, "driver", request, response);
  setAdminSession(response);
  response.json(new ApiResponse(200, { username: process.env.ADMIN_USERNAME }, "Admin logged in."));
});

export const getAdminSession = asyncHandler(async (_request, response) => {
  response.json(new ApiResponse(200, { username: process.env.ADMIN_USERNAME }, "Admin session active."));
});

export const logoutAdmin = asyncHandler(async (_request, response) => {
  clearAdminSession(response);
  response.json(new ApiResponse(200, null, "Admin logged out."));
});

export const listDriversForReview = asyncHandler(async (_request, response) => {
  const drivers = await Driver.find({ verificationStatus: "pending" }).sort({ createdAt: 1 }).limit(100);
  response.json(new ApiResponse(200, { drivers: drivers.map(reviewDriver) }, "Pending drivers fetched."));
});

export const getAdminOverview = asyncHandler(async (_request, response) => {
  const [passengers, drivers, pending, approved, rejected] = await Promise.all([
    Passenger.countDocuments(),
    Driver.countDocuments(),
    Driver.countDocuments({ verificationStatus: "pending" }),
    Driver.countDocuments({ verificationStatus: "approved" }),
    Driver.countDocuments({ verificationStatus: "rejected" }),
  ]);
  response.json(new ApiResponse(200, { passengers, drivers, pending, approved, rejected }, "Admin overview fetched."));
});

export const reviewDriverVerification = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid driver ID.");
  const status = request.body?.status;
  if (!["approved", "rejected"].includes(status)) throw new ApiError(400, "Choose approved or rejected.");
  const driver = await Driver.findOneAndUpdate(
    { _id: request.params.id, verificationStatus: "pending" },
    { $set: { verificationStatus: status } },
    { returnDocument: "after" }
  );
  if (!driver) throw new ApiError(409, "Driver is missing or has already been reviewed.");
  response.json(new ApiResponse(200, { driver: reviewDriver(driver) }, `Driver ${status}.`));
});
