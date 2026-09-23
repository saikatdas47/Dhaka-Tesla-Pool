import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import Pool from "../models/Pool.js";
import RideRequest from "../models/RideRequest.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { areas, compatibleRoutes, fareQuote, requireArea } from "../utils/rideRules.js";
import { getFareSettings } from "../services/fareSettingsService.js";

const activeStatuses = ["MATCHED", "DRIVER_ARRIVED", "STARTED"];

function publicRide(ride) {
  const pool = ride.pool && typeof ride.pool === "object" && "members" in ride.pool ? ride.pool : null;
  const shared = (pool?.members?.length || 0) > 1;
  return {
    id: ride.id,
    pickupArea: ride.pickupArea,
    destinationArea: ride.destinationArea,
    seats: ride.seats,
    approximateKm: ride.approximateKm,
    soloFarePaisa: ride.soloFarePaisa,
    pooledFarePaisa: ride.pooledFarePaisa,
    fareRule: ride.fareRule || null,
    currentFarePaisa: ride.finalFarePaisa ?? (shared ? ride.pooledFarePaisa : ride.soloFarePaisa),
    paymentMethod: ride.paymentMethod || "not recorded",
    paymentStatus: ride.paymentStatus || "not recorded",
    paidAt: ride.paidAt || null,
    status: ride.status,
    poolId: pool?.id || ride.pool?.toString() || null,
    poolSize: pool?.members?.length || 0,
    driverName: pool?.driverName || pool?.driver?.name || null,
    driverArea: pool?.driver?.currentArea || null,
    driverAreaAtMatch: pool?.driverAreaAtMatch || null,
    vehicleName: pool?.vehicleName || null,
    vehicleRegistrationNumber: pool?.vehicleRegistrationNumber || null,
    history: ride.history,
    createdAt: ride.createdAt,
  };
}

function publicPool(pool, rides = []) {
  const rideById = new Map(rides.map((ride) => [String(ride.id), ride]));
  return {
    id: pool.id,
    pickupArea: pool.pickupArea,
    vehicleName: pool.vehicleName,
    vehicleRegistrationNumber: pool.vehicleRegistrationNumber,
    vehicleColor: pool.vehicleColor || null,
    driverName: pool.driverName || null,
    driverAreaAtMatch: pool.driverAreaAtMatch || null,
    capacity: pool.capacity,
    occupiedSeats: pool.occupiedSeats,
    status: pool.status,
    members: pool.members.map((member) => {
      const ride = rideById.get(String(member.request));
      return { requestId: member.request.toString(), seats: member.seats, destinationArea: member.destinationArea, passengerName: member.passengerName || member.passenger?.name || null, paymentMethod: ride?.paymentMethod || "not recorded", paymentStatus: ride?.paymentStatus || "not recorded", farePaisa: ride?.finalFarePaisa ?? null };
    }),
    history: pool.history,
    createdAt: pool.createdAt,
  };
}

async function populatedRide(id) {
  return RideRequest.findById(id).populate({ path: "pool", populate: { path: "driver", select: "name currentArea" } });
}

// A driver accepts the first request. Compatible waiting requests can then
// join that driver's pool automatically until the driver marks arrival.
async function tryAutoJoin(rideId, preferredPoolId = null) {
  const ride = await RideRequest.findOne({ _id: rideId, status: "REQUESTED" });
  if (!ride) return false;
  const pools = await Pool.find({ ...(preferredPoolId ? { _id: preferredPoolId } : {}), pickupArea: ride.pickupArea, status: "MATCHED", $expr: { $lte: [{ $add: ["$occupiedSeats", ride.seats] }, "$capacity"] } })
    .sort({ createdAt: 1 }).limit(20);
  for (const candidate of pools) {
    if (!compatibleRoutes({ pickupArea: candidate.pickupArea, destinationArea: candidate.firstDestinationArea }, ride)) continue;
    const session = await mongoose.startSession();
    try {
      let joined = false;
      await session.withTransaction(async () => {
        const driver = await Driver.findOne({ _id: candidate.driver, availability: "online", verificationStatus: "approved", currentArea: ride.pickupArea }).session(session);
        const waiting = await RideRequest.findOne({ _id: rideId, status: "REQUESTED" }).session(session);
        if (!driver || !waiting) return;
        const at = new Date();
        const pool = await Pool.findOneAndUpdate(
          { _id: candidate.id, status: "MATCHED", pickupArea: waiting.pickupArea, firstDestinationArea: candidate.firstDestinationArea, $expr: { $lte: [{ $add: ["$occupiedSeats", waiting.seats] }, "$capacity"] } },
          { $inc: { occupiedSeats: waiting.seats }, $push: { members: { request: waiting.id, passenger: waiting.passenger, passengerName: waiting.passengerName, seats: waiting.seats, destinationArea: waiting.destinationArea }, history: { status: "PASSENGER_ADDED", at, request: waiting.id, passengerName: waiting.passengerName, seats: waiting.seats } } },
          { session, returnDocument: "after" }
        );
        if (!pool) return;
        const updated = await RideRequest.updateOne({ _id: waiting.id, status: "REQUESTED" }, { $set: { status: "MATCHED", pool: pool.id }, $push: { history: { status: "MATCHED", at } } }, { session });
        if (updated.modifiedCount !== 1) throw new Error("Ride was matched elsewhere; retry.");
        joined = true;
      });
      if (joined) return true;
    } catch {
      // A competing accept/cancellation may win. Keep the request waiting.
    } finally { await session.endSession(); }
  }
  return false;
}

async function fillWaitingPool(poolId) {
  const pool = await Pool.findById(poolId);
  if (!pool || pool.status !== "MATCHED" || pool.occupiedSeats >= pool.capacity) return;
  const waiting = await RideRequest.find({ status: "REQUESTED", pickupArea: pool.pickupArea, seats: { $lte: pool.capacity - pool.occupiedSeats } }).sort({ createdAt: 1 }).limit(30);
  for (const ride of waiting) {
    const current = await Pool.findById(poolId);
    if (!current || current.status !== "MATCHED" || current.occupiedSeats >= current.capacity) break;
    if (ride.seats <= current.capacity - current.occupiedSeats && compatibleRoutes({ pickupArea: current.pickupArea, destinationArea: current.firstDestinationArea }, ride)) {
      await tryAutoJoin(ride.id, poolId);
    }
  }
}

export const getRideConfig = asyncHandler(async (_request, response) => {
  response.json(new ApiResponse(200, { areas }, "Dhaka demo areas."));
});

export const quoteRide = asyncHandler(async (request, response) => {
  const pickupArea = requireArea(request.body?.pickupArea);
  const destinationArea = requireArea(request.body?.destinationArea);
  const quote = fareQuote(pickupArea, destinationArea, Number(request.body?.seats), await getFareSettings());
  response.json(new ApiResponse(200, quote, "Estimated fare. Final fare depends on pool membership."));
});

export const createRide = asyncHandler(async (request, response) => {
  const pickupArea = requireArea(request.body?.pickupArea);
  const destinationArea = requireArea(request.body?.destinationArea);
  const seats = Number(request.body?.seats);
  const quote = fareQuote(pickupArea, destinationArea, seats, await getFareSettings());
  const paymentMethod = request.body?.paymentMethod || "cash";
  if (!["cash", "teslapay"].includes(paymentMethod)) throw new ApiError(400, "Choose Cash or simulated TeslaPay.");
  const active = await RideRequest.exists({ passenger: request.passenger.id, status: { $in: ["REQUESTED", ...activeStatuses] } });
  if (active) throw new ApiError(409, "Finish or cancel your current ride first.");
  try {
    const ride = await RideRequest.create({ passenger: request.passenger.id, passengerName: request.passenger.name, pickupArea, destinationArea, seats, paymentMethod, paymentStatus: "pending", ...quote, history: [{ status: "REQUESTED", at: new Date() }] });
    await tryAutoJoin(ride.id).catch((error) => console.warn("Ride was created, but automatic matching needs retry:", error.message));
    response.status(201).json(new ApiResponse(201, { ride: publicRide(await populatedRide(ride.id)) }, "Ride requested."));
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "You already have an active ride.");
    throw error;
  }
});

export const myRides = asyncHandler(async (request, response) => {
  const view = request.query.view;
  if (view && !["active", "history"].includes(view)) throw new ApiError(400, "Choose active or history.");
  const page = Math.max(1, Math.min(1000, Number.parseInt(request.query.page, 10) || 1));
  const filter = { passenger: request.passenger.id, ...(view === "active" ? { status: { $in: ["REQUESTED", ...activeStatuses] } } : view === "history" ? { status: { $in: ["COMPLETED", "CANCELLED"] } } : {}) };
  const [rides, total] = await Promise.all([
    RideRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).populate({ path: "pool", populate: { path: "driver", select: "name currentArea" } }),
    RideRequest.countDocuments(filter),
  ]);
  response.json(new ApiResponse(200, { rides: rides.map(publicRide), page, pages: Math.ceil(total / 20), total }, "Your rides."));
});

export const nearbyDrivers = asyncHandler(async (_request, response) => {
  const drivers = await Driver.find({ availability: "online", verificationStatus: "approved", currentArea: { $in: Object.keys(areas) } }).select("name vehicleModel vehicleColor currentArea passengerSeats").limit(100);
  const busy = await Pool.find({ status: { $in: activeStatuses } }).select("driver status capacity occupiedSeats");
  const busyIds = new Set(busy.filter((pool) => pool.status !== "MATCHED" || pool.occupiedSeats >= pool.capacity).map((pool) => String(pool.driver)));
  response.json(new ApiResponse(200, { drivers: drivers.filter((driver) => !busyIds.has(driver.id)).map((driver) => ({ id: driver.id, name: driver.name, vehicle: driver.vehicleModel, color: driver.vehicleColor, seats: driver.passengerSeats, area: driver.currentArea, position: areas[driver.currentArea] })) }, "Available drivers by manually selected area."));
});

export const driverOffers = asyncHandler(async (request, response) => {
  const driver = request.driver;
  if (driver.availability !== "online" || driver.verificationStatus !== "approved" || !driver.currentArea) return response.json(new ApiResponse(200, { offers: [] }, "Go online in an area to see offers."));
  const pool = await Pool.findOne({ driver: driver.id, status: { $in: activeStatuses } });
  if (pool && pool.status !== "MATCHED") return response.json(new ApiResponse(200, { offers: [] }, "Finish your current trip first."));
  const rides = await RideRequest.find({ status: "REQUESTED", pickupArea: driver.currentArea, seats: { $lte: pool ? pool.capacity - pool.occupiedSeats : driver.passengerSeats } }).sort({ createdAt: 1 }).limit(30);
  const offers = pool ? rides.filter((ride) => compatibleRoutes({ pickupArea: pool.pickupArea, destinationArea: pool.firstDestinationArea }, ride)) : rides;
  response.json(new ApiResponse(200, { offers: offers.map(publicRide) }, "Ride offers for your current area."));
});

export const driverPool = asyncHandler(async (request, response) => {
  const pool = await Pool.findOne({ driver: request.driver.id, status: { $in: activeStatuses } }).populate("members.passenger", "name");
  const rides = pool ? await RideRequest.find({ pool: pool.id }) : [];
  response.json(new ApiResponse(200, { pool: pool ? publicPool(pool, rides) : null }, "Current pool."));
});

export const driverHistory = asyncHandler(async (request, response) => {
  const page = Math.max(1, Math.min(1000, Number.parseInt(request.query.page, 10) || 1));
  const filter = { driver: request.driver.id, status: { $in: ["COMPLETED", "CANCELLED"] } };
  const [pools, total] = await Promise.all([
    Pool.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * 20).limit(20).populate("members.passenger", "name"),
    Pool.countDocuments(filter),
  ]);
  const rides = pools.length ? await RideRequest.find({ pool: { $in: pools.map((pool) => pool.id) } }) : [];
  response.json(new ApiResponse(200, { pools: pools.map((pool) => publicPool(pool, rides)), page, pages: Math.ceil(total / 20), total }, "Past driver trips."));
});

export const acceptRide = asyncHandler(async (request, response) => {
  const driver = request.driver;
  if (driver.availability !== "online" || driver.verificationStatus !== "approved" || !driver.currentArea) throw new ApiError(403, "Go online in an area after admin approval.");
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid ride ID.");
  const session = await mongoose.startSession();
  let poolId;
  try {
    await session.withTransaction(async () => {
      const activeDriver = await Driver.findOneAndUpdate(
        { _id: driver.id, verificationStatus: "approved", availability: "online", currentArea: driver.currentArea },
        { $set: { lastOfferAcceptedAt: new Date() } },
        { session, returnDocument: "after" }
      );
      if (!activeDriver) throw new ApiError(403, "Driver approval, availability, or area changed. Refresh your offers.");
      const ride = await RideRequest.findOne({ _id: request.params.id, status: "REQUESTED", pickupArea: driver.currentArea }).session(session);
      if (!ride) throw new ApiError(409, "Ride is no longer available in your area.");
      let pool = await Pool.findOne({ driver: driver.id, status: { $in: activeStatuses } }).session(session);
      if (pool) {
        if (pool.status !== "MATCHED" || !compatibleRoutes({ pickupArea: pool.pickupArea, destinationArea: pool.firstDestinationArea }, ride)) throw new ApiError(409, "Finish the current pool before accepting this route.");
        pool = await Pool.findOneAndUpdate({ _id: pool.id, status: "MATCHED", $expr: { $lte: [{ $add: ["$occupiedSeats", ride.seats] }, "$capacity"] } }, {
          $inc: { occupiedSeats: ride.seats },
          $push: { members: { request: ride.id, passenger: ride.passenger, passengerName: ride.passengerName, seats: ride.seats, destinationArea: ride.destinationArea } },
        }, { session, returnDocument: "after" });
        if (!pool) throw new ApiError(409, "No seats remain in this pool.");
        await Pool.updateOne({ _id: pool.id }, { $push: { history: { status: "PASSENGER_ADDED", at: new Date(), request: ride.id, passengerName: ride.passengerName, seats: ride.seats } } }, { session });
      } else {
        if (ride.seats > activeDriver.passengerSeats) throw new ApiError(409, "This ride needs more seats than your vehicle has.");
        [pool] = await Pool.create([{ driver: driver.id, pickupArea: ride.pickupArea, firstDestinationArea: ride.destinationArea, vehicleName: activeDriver.vehicleModel, vehicleRegistrationNumber: activeDriver.vehicleRegistrationNumber, vehicleColor: activeDriver.vehicleColor, driverName: activeDriver.name, driverAreaAtMatch: activeDriver.currentArea, capacity: activeDriver.passengerSeats, occupiedSeats: ride.seats, members: [{ request: ride.id, passenger: ride.passenger, passengerName: ride.passengerName, seats: ride.seats, destinationArea: ride.destinationArea }], history: [{ status: "MATCHED", at: new Date() }, { status: "PASSENGER_ADDED", at: new Date(), request: ride.id, passengerName: ride.passengerName, seats: ride.seats }] }], { session });
      }
      const changed = await RideRequest.updateOne({ _id: ride.id, status: "REQUESTED" }, { $set: { status: "MATCHED", pool: pool.id }, $push: { history: { status: "MATCHED", at: new Date() } } }, { session });
      if (changed.modifiedCount !== 1) throw new ApiError(409, "Ride was already accepted.");
      poolId = pool.id;
    });
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "A pool is already active. Refresh your offers.");
    throw error;
  } finally { await session.endSession(); }
  await fillWaitingPool(poolId).catch((error) => console.warn("Pool was accepted, but automatic waiting-request matching needs retry:", error.message));
  const pool = await Pool.findById(poolId).populate("members.passenger", "name");
  response.json(new ApiResponse(200, { pool: publicPool(pool) }, "Ride added to your pool."));
});

export const cancelRide = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid ride ID.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ride = await RideRequest.findOne({ _id: request.params.id, passenger: request.passenger.id }).session(session);
      if (!ride) throw new ApiError(404, "Ride not found.");
      if (!["REQUESTED", "MATCHED", "DRIVER_ARRIVED"].includes(ride.status)) throw new ApiError(409, "This ride can no longer be cancelled.");
      if (ride.pool) {
        const pool = await Pool.findOneAndUpdate({ _id: ride.pool, status: { $in: ["MATCHED", "DRIVER_ARRIVED"] }, "members.request": ride.id }, {
          $inc: { occupiedSeats: -ride.seats }, $pull: { members: { request: ride.id } }, $push: { history: { status: "PASSENGER_CANCELLED", at: new Date(), request: ride.id, passengerName: ride.passengerName, seats: ride.seats } },
        }, { session, returnDocument: "after" });
        if (!pool) throw new ApiError(409, "The driver has already started this trip.");
        if (pool.members.length === 0) await Pool.updateOne({ _id: pool.id }, { $set: { status: "CANCELLED" }, $push: { history: { status: "CANCELLED", at: new Date() } } }, { session });
      }
      const updated = await RideRequest.updateOne({ _id: ride.id, status: ride.status }, { $set: { status: "CANCELLED", paymentStatus: "cancelled" }, $push: { history: { status: "CANCELLED", at: new Date() } } }, { session });
      if (updated.modifiedCount !== 1) throw new ApiError(409, "Ride status changed. Refresh and try again.");
    });
  } finally { await session.endSession(); }
  response.json(new ApiResponse(200, { ride: publicRide(await populatedRide(request.params.id)) }, "Ride cancelled."));
});

export const advancePool = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid pool ID.");
  const next = request.body?.status;
  const previous = { DRIVER_ARRIVED: "MATCHED", STARTED: "DRIVER_ARRIVED", COMPLETED: "STARTED" }[next];
  if (!previous) throw new ApiError(400, "Choose the next trip status.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const pool = await Pool.findOneAndUpdate({ _id: request.params.id, driver: request.driver.id, status: previous }, {
        $set: { status: next }, $push: { history: { status: next, at: new Date() } },
      }, { session, returnDocument: "after" });
      if (!pool) throw new ApiError(409, "Trip status changed or this is not your pool.");
      const now = new Date();
      const shared = pool.members.length > 1;
      for (const member of pool.members) {
        const ride = await RideRequest.findById(member.request).session(session);
        if (!ride || ride.status !== previous) throw new ApiError(409, "Passenger ride status is inconsistent.");
        const simulatedPay = (ride.paymentMethod || "cash") === "teslapay";
        const changes = { status: next, ...(next === "COMPLETED" ? { finalFarePaisa: shared ? ride.pooledFarePaisa : ride.soloFarePaisa, paymentStatus: simulatedPay ? "paid" : "due", ...(simulatedPay ? { paidAt: now } : {}) } : {}) };
        const events = [{ status: next, at: now }, ...(next === "COMPLETED" ? [{ status: simulatedPay ? "PAYMENT_PAID" : "PAYMENT_DUE", at: now }] : [])];
        await RideRequest.updateOne({ _id: ride.id, status: previous }, { $set: changes, $push: { history: { $each: events } } }, { session });
      }
    });
  } finally { await session.endSession(); }
  const pool = await Pool.findById(request.params.id).populate("members.passenger", "name");
  response.json(new ApiResponse(200, { pool: publicPool(pool) }, "Trip status updated."));
});

export const confirmCashPayment = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid ride ID.");
  const ride = await RideRequest.findById(request.params.id).populate("pool");
  if (!ride || String(ride.pool?.driver) !== request.driver.id) throw new ApiError(404, "Ride not found for this driver.");
  const now = new Date();
  const updated = await RideRequest.findOneAndUpdate(
    { _id: ride.id, status: "COMPLETED", paymentMethod: "cash", paymentStatus: "due" },
    { $set: { paymentStatus: "paid", paidAt: now }, $push: { history: { status: "PAYMENT_PAID", at: now } } },
    { returnDocument: "after" }
  );
  if (!updated) throw new ApiError(409, "Only completed cash rides awaiting payment can be confirmed.");
  response.json(new ApiResponse(200, { ride: publicRide(await populatedRide(updated.id)) }, "Cash payment confirmed."));
});
