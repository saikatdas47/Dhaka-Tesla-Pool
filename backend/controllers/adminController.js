import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import Passenger from "../models/Passenger.js";
import FareSettings from "../models/FareSettings.js";
import { getFareSettings } from "../services/fareSettingsService.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  checkAdminCredentials,
  clearAdminSession,
  setAdminSession,
} from "../middlewares/admin.middleware.js";
import { endSession } from "../services/sessionService.js";

function reviewDriver(driver) {
  return {
    id: driver.id,
    name: driver.name,
    avatarUrl: driver.avatarUrl || null,
    username: driver.username,
    email: driver.email,
    phone: driver.phone,
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    vehicleModel: driver.vehicleModel,
    vehicleRegistrationNumber: driver.vehicleRegistrationNumber,
    serviceArea: driver.serviceArea,
    vehicleColor: driver.vehicleColor,
    passengerSeats: driver.passengerSeats,
    availability: driver.availability || "offline",
    currentArea: driver.currentArea || null,
    locationSource: driver.locationSource || "manual",
    locationUpdatedAt: driver.locationUpdatedAt || null,
    emailVerifiedAt: driver.emailVerifiedAt || null,
    createdAt: driver.createdAt || null,
    updatedAt: driver.updatedAt || null,
    verificationStatus: driver.verificationStatus,
    verificationHistory: driver.verificationHistory || [],
  };
}

function passengerSummary(passenger) {
  return {
    id: passenger.id,
    name: passenger.name,
    username: passenger.username,
    email: passenger.email,
    phone: passenger.phone || null,
    avatarUrl: passenger.avatarUrl || null,
    emailVerifiedAt: passenger.emailVerifiedAt || null,
    createdAt: passenger.createdAt || null,
  };
}

export const listPassengers = asyncHandler(async (request, response) => {
  const field = request.query.field || "all";
  const fields = {
    name: "name",
    username: "username",
    email: "email",
    phone: "phone",
  };
  if (field !== "all" && !fields[field])
    throw new ApiError(400, "Invalid search field.");
  const query = String(request.query.q || "").trim();
  if (query.length > 80) throw new ApiError(400, "Search text is too long.");
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(request.query.page, 10) || 1),
  );
  const filter = {};
  if (query) {
    const pattern = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    if (field === "all")
      filter.$or = Object.values(fields).map((key) => ({ [key]: pattern }));
    else filter[fields[field]] = pattern;
  }
  const [passengers, total] = await Promise.all([
    Passenger.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20),
    Passenger.countDocuments(filter),
  ]);
  response.json(
    new ApiResponse(
      200,
      {
        passengers: passengers.map(passengerSummary),
        page,
        pages: Math.ceil(total / 20),
        total,
      },
      "Passenger accounts fetched.",
    ),
  );
});

export const getPassengerForAdmin = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid passenger ID.");
  const passenger = await Passenger.findById(request.params.id);
  if (!passenger) throw new ApiError(404, "Passenger not found.");
  response.json(
    new ApiResponse(
      200,
      { passenger: passengerSummary(passenger) },
      "Passenger details fetched.",
    ),
  );
});

export const loginAdmin = asyncHandler(async (request, response) => {
  if (!checkAdminCredentials(request.body?.username, request.body?.password))
    throw new ApiError(401, "Admin username or password is incorrect.");
  await endSession(Passenger, "passenger", request, response);
  await endSession(Driver, "driver", request, response);
  setAdminSession(response);
  response.json(
    new ApiResponse(
      200,
      { username: process.env.ADMIN_USERNAME },
      "Admin logged in.",
    ),
  );
});

export const getAdminSession = asyncHandler(async (_request, response) => {
  response.json(
    new ApiResponse(
      200,
      { username: process.env.ADMIN_USERNAME },
      "Admin session active.",
    ),
  );
});

export const getLocalAdminAutofill = asyncHandler(async (request, response) => {
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    request.hostname,
  );
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEMO_ACCOUNTS !== "true" ||
    process.env.ENABLE_ADMIN_AUTOFILL !== "true" ||
    !localHost
  ) {
    throw new ApiError(404, "Local admin autofill is unavailable.");
  }
  response.set("Cache-Control", "no-store");
  response.json(
    new ApiResponse(
      200,
      {
        username: process.env.ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD,
      },
      "Local admin autofill.",
    ),
  );
});

export const logoutAdmin = asyncHandler(async (_request, response) => {
  clearAdminSession(response);
  response.json(new ApiResponse(200, null, "Admin logged out."));
});

export const listDriversForReview = asyncHandler(async (request, response) => {
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(request.query.page, 10) || 1),
  );
  const filter = { verificationStatus: { $in: ["pending", "unverified"] } };
  const [drivers, total] = await Promise.all([
    Driver.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * 20)
      .limit(20),
    Driver.countDocuments(filter),
  ]);
  response.json(
    new ApiResponse(
      200,
      {
        drivers: drivers.map(reviewDriver),
        page,
        pages: Math.ceil(total / 20),
        total,
      },
      "Drivers awaiting review fetched.",
    ),
  );
});

export const listDrivers = asyncHandler(async (request, response) => {
  const field = request.query.field || "all";
  const fields = {
    name: "name",
    email: "email",
    username: "username",
    licence: "licenseNumber",
  };
  if (field !== "all" && !fields[field])
    throw new ApiError(400, "Invalid search field.");
  const query = String(request.query.q || "").trim();
  if (query.length > 80) throw new ApiError(400, "Search text is too long.");
  const seats = request.query.seats;
  if (seats && !["2", "3", "4"].includes(String(seats)))
    throw new ApiError(400, "Seats must be 2, 3, or 4.");
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(request.query.page, 10) || 1),
  );
  const filter = {};
  if (seats) filter.passengerSeats = Number(seats);
  if (query) {
    const pattern = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    if (field === "all")
      filter.$or = Object.values(fields).map((key) => ({ [key]: pattern }));
    else filter[fields[field]] = pattern;
  }
  const [drivers, total] = await Promise.all([
    Driver.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20),
    Driver.countDocuments(filter),
  ]);
  response.json(
    new ApiResponse(
      200,
      {
        drivers: drivers.map(reviewDriver),
        page,
        pages: Math.ceil(total / 20),
        total,
      },
      "Driver accounts fetched.",
    ),
  );
});

export const getDriverForAdmin = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid driver ID.");
  const driver = await Driver.findById(request.params.id);
  if (!driver) throw new ApiError(404, "Driver not found.");
  response.json(
    new ApiResponse(
      200,
      { driver: reviewDriver(driver) },
      "Driver details fetched.",
    ),
  );
});

export const getAdminOverview = asyncHandler(async (_request, response) => {
  const [passengers, drivers, pending, approved, rejected, unverified] =
    await Promise.all([
      Passenger.countDocuments(),
      Driver.countDocuments(),
      Driver.countDocuments({ verificationStatus: "pending" }),
      Driver.countDocuments({ verificationStatus: "approved" }),
      Driver.countDocuments({ verificationStatus: "rejected" }),
      Driver.countDocuments({ verificationStatus: "unverified" }),
    ]);
  response.json(
    new ApiResponse(
      200,
      { passengers, drivers, pending, approved, rejected, unverified },
      "Admin overview fetched.",
    ),
  );
});

export const getAdminFareSettings = asyncHandler(async (_request, response) => {
  response.json(
    new ApiResponse(200, await getFareSettings(), "Fare settings fetched."),
  );
});

export const updateAdminFareSettings = asyncHandler(
  async (request, response) => {
    const { baseFarePaisa, perKmPaisa, sharedDiscountPercent } =
      request.body || {};
    const discountFields = {};
    for (const key of [
      "discountBpsPerKm2",
      "discountBpsPerKm3",
      "discountBpsPerKm4",
      "maxDiscountBps",
    ]) {
      const value = request.body?.[key];
      if (value === undefined) continue; // Older clients remain compatible.
      if (!Number.isInteger(value) || value < 0 || value > 10000)
        throw new ApiError(
          400,
          "Discount values must be 0–10000 basis points.",
        );
      discountFields[key] = value;
    }
    if (
      !Number.isSafeInteger(baseFarePaisa) ||
      baseFarePaisa < 0 ||
      baseFarePaisa > 1000000 ||
      !Number.isSafeInteger(perKmPaisa) ||
      perKmPaisa < 0 ||
      perKmPaisa > 100000 ||
      !Number.isSafeInteger(sharedDiscountPercent) ||
      sharedDiscountPercent < 0 ||
      sharedDiscountPercent > 100
    ) {
      throw new ApiError(
        400,
        "Use integer paisa: base 0–1000000, per km 0–100000, and discount 0–100%. ",
      );
    }
    const settings = await FareSettings.findOneAndUpdate(
      { _id: "current" },
      {
        $set: {
          baseFarePaisa,
          perKmPaisa,
          sharedDiscountPercent,
          ...discountFields,
        },
      },
      { upsert: true, runValidators: true, returnDocument: "after" },
    );
    response.json(
      new ApiResponse(
        200,
        {
          baseFarePaisa: settings.baseFarePaisa,
          perKmPaisa: settings.perKmPaisa,
          sharedDiscountPercent: settings.sharedDiscountPercent,
          discountBpsPerKm2: settings.discountBpsPerKm2 ?? 150,
          discountBpsPerKm3: settings.discountBpsPerKm3 ?? 200,
          discountBpsPerKm4: settings.discountBpsPerKm4 ?? 250,
          maxDiscountBps: settings.maxDiscountBps ?? 3000,
          updatedAt: settings.updatedAt,
          configured: true,
        },
        "Fare settings saved. New rides use these rates.",
      ),
    );
  },
);

export const reviewDriverVerification = asyncHandler(
  async (request, response) => {
    if (!mongoose.isValidObjectId(request.params.id))
      throw new ApiError(400, "Invalid driver ID.");
    const status = request.body?.status;
    if (!["approved", "rejected", "unverified"].includes(status))
      throw new ApiError(400, "Choose approved, rejected, or unverified.");
    const allowedPrevious =
      status === "unverified"
        ? ["approved", "rejected"]
        : ["pending", "unverified"];
    const driver = await Driver.findOneAndUpdate(
      { _id: request.params.id, verificationStatus: { $in: allowedPrevious } },
      {
        $set: {
          verificationStatus: status,
          ...(status === "unverified" ? { availability: "offline" } : {}),
        },
        $push: { verificationHistory: { status, at: new Date(), by: "admin" } },
      },
      { returnDocument: "after" },
    );
    if (!driver)
      throw new ApiError(
        409,
        "Driver is missing or this status change is not allowed.",
      );
    response.json(
      new ApiResponse(
        200,
        { driver: reviewDriver(driver) },
        `Driver ${status}.`,
      ),
    );
  },
);
