import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import Pool from "../models/Pool.js";
import RideRequest from "../models/RideRequest.js";
import RideChat from "../models/RideChat.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  areas,
  edges,
  shortestPath,
  planBooking,
  priceForDistance,
  rideIndexes,
  reserveSeats,
  hasSharedSegment,
  fareQuote,
  requireArea,
} from "../utils/rideRules.js";
import { getFareSettings } from "../services/fareSettingsService.js";
import { notifyChatClosed, openRideChat } from "../services/rideChatService.js";

const activeStatuses = ["MATCHED", "DRIVER_ARRIVED", "STARTED"];

function publicRide(ride) {
  const pool =
    ride.pool && typeof ride.pool === "object" && "members" in ride.pool
      ? ride.pool
      : null;
  const shared = pool?.routeCode
    ? hasSharedSegment(pool, ride)
    : (pool?.members?.length || 0) > 1;
  return {
    id: ride.id,
    routeCode: ride.routeCode,
    routeStops: ride.routeStops,
    segmentKm: ride.segmentKm,
    direction: ride.direction,
    pickupIndex: ride.pickupIndex,
    destinationIndex: ride.destinationIndex,
    pickupArea: ride.pickupArea,
    destinationArea: ride.destinationArea,
    seats: ride.seats,
    approximateKm: ride.approximateKm,
    soloFarePaisa: ride.soloFarePaisa,
    pooledFarePaisa: ride.pooledFarePaisa,
    fareRule: ride.fareRule || null,
    currentFarePaisa:
      ride.finalFarePaisa ??
      (shared ? ride.pooledFarePaisa : ride.soloFarePaisa),
    paymentMethod: ride.paymentMethod || "not recorded",
    paymentStatus: ride.paymentStatus || "not recorded",
    paidAt: ride.paidAt || null,
    status: ride.status,
    poolId: pool?.id || ride.pool?.toString() || null,
    poolSize: pool?.routeCode
      ? pool.members.filter(
          (member) =>
            member.status !== "CANCELLED" &&
            member.pickupIndex < ride.destinationIndex &&
            ride.pickupIndex < member.destinationIndex,
        ).length
      : pool?.members?.length || 0,
    driverName: pool?.driverName || pool?.driver?.name || null,
    driverArea: pool?.driver?.currentArea || null,
    driverAvailability: pool?.driver?.availability || "offline",
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
    routeCode: pool.routeCode,
    direction: pool.direction,
    routeStops: pool.routeStops,
    segmentSeats: pool.segmentSeats,
    endIndex: pool.endIndex,
    currentStopIndex: pool.currentStopIndex,
    destinationArea: pool.routeStops?.at(-1),
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
      return {
        requestId: member.request.toString(),
        seats: member.seats,
        pickupArea: member.pickupArea || pool.pickupArea,
        status: ride?.status || member.status,
        pickupIndex: member.pickupIndex,
        destinationIndex: member.destinationIndex,
        destinationArea: member.destinationArea,
        passengerName: member.passengerName || member.passenger?.name || null,
        paymentMethod: ride?.paymentMethod || "not recorded",
        paymentStatus: ride?.paymentStatus || "not recorded",
        farePaisa: ride?.finalFarePaisa ?? null,
      };
    }),
    history: pool.history,
    createdAt: pool.createdAt,
  };
}

async function populatedRide(id) {
  return RideRequest.findById(id).populate({
    path: "pool",
    populate: { path: "driver", select: "name currentArea availability" },
  });
}

export const getRideConfig = asyncHandler(async (_request, response) => {
  response.json(new ApiResponse(200, { areas, edges }, "Dhaka demo areas."));
});

export const quoteRide = asyncHandler(async (request, response) => {
  const pickupArea = requireArea(request.body?.pickupArea);
  const destinationArea = requireArea(request.body?.destinationArea);
  const quote = fareQuote(
    pickupArea,
    destinationArea,
    Number(request.body?.seats),
    await getFareSettings(),
  );
  response.json(
    new ApiResponse(
      200,
      quote,
      "Estimated fare. Final fare depends on pool membership.",
    ),
  );
});

export const getRidePath = asyncHandler(async (request, response) => {
  response.json(
    new ApiResponse(
      200,
      shortestPath(request.query.pickup, request.query.destination),
      "Shortest demo path.",
    ),
  );
});

export const createRide = asyncHandler(async (request, response) => {
  const pickupArea = requireArea(request.body?.pickupArea);
  const destinationArea = requireArea(request.body?.destinationArea);
  const seats = Number(request.body?.seats);
  const quote = fareQuote(
    pickupArea,
    destinationArea,
    seats,
    await getFareSettings(),
  );
  const paymentMethod = request.body?.paymentMethod || "cash";
  if (!["cash", "teslapay"].includes(paymentMethod))
    throw new ApiError(400, "Choose Cash or simulated TeslaPay.");
  const active = await RideRequest.exists({
    passenger: request.passenger.id,
    status: { $in: ["REQUESTED", ...activeStatuses] },
  });
  if (active)
    throw new ApiError(409, "Finish or cancel your current ride first.");
  try {
    const ride = await RideRequest.create({
      passenger: request.passenger.id,
      passengerName: request.passenger.name,
      pickupArea,
      destinationArea,
      seats,
      paymentMethod,
      paymentStatus: "pending",
      ...quote,
      history: [{ status: "REQUESTED", at: new Date() }],
    });
    response
      .status(201)
      .json(
        new ApiResponse(
          201,
          { ride: publicRide(await populatedRide(ride.id)) },
          "Ride requested.",
        ),
      );
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(409, "You already have an active ride.");
    throw error;
  }
});

export const myRides = asyncHandler(async (request, response) => {
  const view = request.query.view;
  if (view && !["active", "history"].includes(view))
    throw new ApiError(400, "Choose active or history.");
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(request.query.page, 10) || 1),
  );
  const filter = {
    passenger: request.passenger.id,
    ...(view === "active"
      ? { status: { $in: ["REQUESTED", ...activeStatuses] } }
      : view === "history"
        ? { status: { $in: ["COMPLETED", "CANCELLED"] } }
        : {}),
  };
  const [rides, total] = await Promise.all([
    RideRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .populate({
        path: "pool",
        populate: { path: "driver", select: "name currentArea availability" },
      }),
    RideRequest.countDocuments(filter),
  ]);
  response.json(
    new ApiResponse(
      200,
      {
        rides: rides.map(publicRide),
        page,
        pages: Math.ceil(total / 20),
        total,
      },
      "Your rides.",
    ),
  );
});

export const nearbyDrivers = asyncHandler(async (_request, response) => {
  const drivers = await Driver.find({
    availability: "online",
    verificationStatus: "approved",
    currentArea: { $in: Object.keys(areas) },
  })
    .select("name vehicleModel vehicleColor currentArea passengerSeats")
    .limit(100);
  response.json(
    new ApiResponse(
      200,
      {
        drivers: drivers.map((driver) => ({
          id: driver.id,
          name: driver.name,
          vehicle: driver.vehicleModel,
          color: driver.vehicleColor,
          seats: driver.passengerSeats,
          area: driver.currentArea,
          position: areas[driver.currentArea],
        })),
      },
      "Available drivers by manually selected area.",
    ),
  );
});

export const driverOffers = asyncHandler(async (request, response) => {
  const driver = request.driver;
  if (
    driver.availability !== "online" ||
    driver.verificationStatus !== "approved" ||
    !driver.currentArea ||
    new Date(driver.licenseExpiry) <= new Date()
  ) {
    return response.json(
      new ApiResponse(200, { offers: [] }, "Go online after approval."),
    );
  }
  const pool = await Pool.findOne({
    driver: driver.id,
    status: { $in: activeStatuses },
  });
  if (pool && pool.routeCode !== "graph-v1")
    return response.json(
      new ApiResponse(200, { offers: [] }, "Finish the older pool first."),
    );
  const filter = {
    status: "REQUESTED",
    seats: { $lte: driver.passengerSeats },
  };
  if (pool)
    filter.pickupArea = { $in: pool.routeStops.slice(pool.currentStopIndex) };
  else filter.pickupArea = driver.currentArea;
  const rides = await RideRequest.find(filter)
    .sort({ createdAt: 1 })
    .limit(200);
  const offers = [];
  for (const ride of rides) {
    let plan = null;
    if (pool)
      plan = planBooking(pool, pool.routeStops[pool.currentStopIndex], ride);
    else plan = firstBookingPlan(driver, ride);
    if (!plan) continue;
    offers.push({
      ...publicRide(ride),
      proposedPath: plan.routeStops,
      extensionStops: plan.extensionStops || [],
      addedKm: plan.addedKm || 0,
      compatibility: plan.addedKm
        ? "Forward extension after " + pool.routeStops.at(-1)
        : "Compatible: same forward path",
    });
  }
  response.json(
    new ApiResponse(200, { offers }, "Compatible graph-path bookings."),
  );
});

function firstBookingPlan(driver, ride) {
  if (
    ride.pickupArea !== driver.currentArea ||
    ride.seats > driver.passengerSeats
  )
    return null;
  const path = shortestPath(ride.pickupArea, ride.destinationArea);
  return {
    ...path,
    capacity: driver.passengerSeats,
    segmentSeats: path.segmentKm.map(() => 0),
    endIndex: path.routeStops.length - 1,
    pickup: 0,
    destination: path.routeStops.length - 1,
  };
}

export const driverPool = asyncHandler(async (request, response) => {
  const pool = await Pool.findOne({
    driver: request.driver.id,
    status: { $in: activeStatuses },
  }).populate("members.passenger", "name");
  const rides = pool ? await RideRequest.find({ pool: pool.id }) : [];
  response.json(
    new ApiResponse(
      200,
      { pool: pool ? publicPool(pool, rides) : null },
      "Current pool.",
    ),
  );
});

export const driverHistory = asyncHandler(async (request, response) => {
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(request.query.page, 10) || 1),
  );
  const filter = {
    driver: request.driver.id,
    status: { $in: ["COMPLETED", "CANCELLED"] },
  };
  const [pools, total] = await Promise.all([
    Pool.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .populate("members.passenger", "name"),
    Pool.countDocuments(filter),
  ]);
  const rides = pools.length
    ? await RideRequest.find({ pool: { $in: pools.map((pool) => pool.id) } })
    : [];
  response.json(
    new ApiResponse(
      200,
      {
        pools: pools.map((pool) => publicPool(pool, rides)),
        page,
        pages: Math.ceil(total / 20),
        total,
      },
      "Past driver trips.",
    ),
  );
});

export const acceptRide = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid ride ID.");
  const session = await mongoose.startSession();
  let poolId;
  try {
    await session.withTransaction(async () => {
      // Write this Driver document to serialize accept, location, and offline changes.
      const driver = await Driver.findOneAndUpdate(
        {
          _id: request.driver.id,
          availability: "online",
          verificationStatus: "approved",
          licenseExpiry: { $gt: new Date() },
        },
        { $set: { lastOfferAcceptedAt: new Date() } },
        { session, returnDocument: "after" },
      );
      if (!driver)
        throw new ApiError(
          403,
          "An approved online Driver with a valid licence is required.",
        );
      const ride = await RideRequest.findOne({
        _id: request.params.id,
        status: "REQUESTED",
      }).session(session);
      if (!ride) throw new ApiError(409, "Request is no longer available.");
      let pool = await Pool.findOne({
        driver: driver.id,
        status: { $in: activeStatuses },
      }).session(session);
      if (pool && pool.routeCode !== "graph-v1")
        throw new ApiError(409, "Finish the older pool first.");
      const trip = pool
        ? planBooking(pool, pool.routeStops[pool.currentStopIndex], ride)
        : firstBookingPlan(driver, ride);
      if (!trip)
        throw new ApiError(
          409,
          "Pickup is behind, path reverses/branches, or a segment is full.",
        );
      const { pickup, destination } = trip;
      let distance = 0;
      for (let index = pickup; index < destination; index++)
        distance += trip.segmentKm[index];
      const quote = priceForDistance(
        distance,
        ride.seats,
        ride.fareRule?.baseFarePaisa != null
          ? ride.fareRule
          : await getFareSettings(),
      );
      const member = {
        request: ride.id,
        passenger: ride.passenger,
        passengerName: ride.passengerName,
        seats: ride.seats,
        pickupArea: ride.pickupArea,
        destinationArea: ride.destinationArea,
        pickupIndex: pickup,
        destinationIndex: destination,
        status: "MATCHED",
      };
      const event = {
        status: "PASSENGER_ADDED",
        at: new Date(),
        request: ride.id,
        passengerName: ride.passengerName,
        seats: ride.seats,
      };
      const segmentSeats = reserveSeats(trip, ride);
      if (pool) {
        pool.routeStops = trip.routeStops;
        pool.segmentKm = trip.segmentKm;
        pool.endIndex = trip.endIndex;
        pool.segmentSeats = segmentSeats;
        if (trip.addedKm)
          pool.history.push({
            status: "ROUTE_EXTENDED",
            at: new Date(),
            request: ride.id,
          });
        pool.members.push(member);
        pool.history.push(event);
        await pool.save({ session });
      } else {
        [pool] = await Pool.create(
          [
            {
              ...trip,
              routeCode: "graph-v1",
              currentStopIndex: 0,
              segmentSeats,
              driver: driver.id,
              pickupArea: ride.pickupArea,
              firstDestinationArea: ride.destinationArea,
              driverName: driver.name,
              driverAreaAtMatch: driver.currentArea,
              vehicleName: driver.vehicleModel,
              vehicleRegistrationNumber: driver.vehicleRegistrationNumber,
              vehicleColor: driver.vehicleColor,
              occupiedSeats: 0,
              members: [member],
              history: [{ status: "MATCHED", at: new Date() }, event],
            },
          ],
          { session },
        );
      }
      const changed = await RideRequest.updateOne(
        { _id: ride.id, status: "REQUESTED" },
        {
          $set: {
            ...quote,
            routeCode: "graph-v1",
            routeStops: trip.routeStops.slice(pickup, destination + 1),
            segmentKm: trip.segmentKm.slice(pickup, destination),
            status: "MATCHED",
            pool: pool.id,
            pickupIndex: pickup,
            destinationIndex: destination,
          },
          $push: { history: { status: "MATCHED", at: new Date() } },
        },
        { session },
      );
      if (changed.modifiedCount !== 1)
        throw new ApiError(409, "Request was accepted elsewhere.");
      await openRideChat(ride, pool, session);
      poolId = pool.id;
    });
  } catch (error) {
    if (error.code === 11000)
      throw new ApiError(409, "Another acceptance won. Refresh and try again.");
    throw error;
  } finally {
    await session.endSession();
  }
  const pool = await Pool.findById(poolId);
  const rides = await RideRequest.find({ pool: poolId });
  response.json(
    new ApiResponse(
      200,
      { pool: publicPool(pool, rides) },
      "Booking accepted into your pool.",
    ),
  );
});

export const cancelRide = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid ride ID.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ride = await RideRequest.findOne({
        _id: request.params.id,
        passenger: request.passenger.id,
      }).session(session);
      if (!ride) throw new ApiError(404, "Ride not found.");
      if (!["REQUESTED", "MATCHED", "DRIVER_ARRIVED"].includes(ride.status))
        throw new ApiError(409, "Cannot cancel after boarding.");
      if (ride.pool) {
        const pool = await Pool.findById(ride.pool).session(session);
        if (!pool || !activeStatuses.includes(pool.status))
          throw new ApiError(409, "Pool is no longer active.");
        if (pool.routeCode) {
          pool.segmentSeats = reserveSeats(pool, ride, -1);
          const member = pool.members.find(
            (item) => String(item.request) === ride.id,
          );
          if (!member)
            throw new ApiError(409, "Booking membership is inconsistent.");
          member.status = "CANCELLED";
          if (
            pool.members.every((item) =>
              ["COMPLETED", "CANCELLED"].includes(item.status),
            )
          )
            pool.status = pool.members.some(
              (item) => item.status === "COMPLETED",
            )
              ? "COMPLETED"
              : "CANCELLED";
        } else {
          if (pool.status === "STARTED")
            throw new ApiError(409, "Legacy trip already started.");
          pool.members = pool.members.filter(
            (item) => String(item.request) !== ride.id,
          );
          pool.occupiedSeats -= ride.seats;
          if (!pool.members.length) pool.status = "CANCELLED";
        }
        pool.history.push({
          status: "PASSENGER_CANCELLED",
          at: new Date(),
          request: ride.id,
          passengerName: ride.passengerName,
          seats: ride.seats,
        });
        await pool.save({ session });
      }
      ride.status = "CANCELLED";
      ride.paymentStatus = "cancelled";
      ride.history.push({ status: "CANCELLED", at: new Date() });
      await ride.save({ session });
      await RideChat.deleteOne({ ride: ride.id }, { session });
    });
  } finally {
    await session.endSession();
  }
  notifyChatClosed(request.app.locals.io, [request.params.id]);
  response.json(
    new ApiResponse(
      200,
      { ride: publicRide(await populatedRide(request.params.id)) },
      "Ride cancelled.",
    ),
  );
});

export const advancePassengerRide = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid ride ID.");
  const next = request.body?.status;
  const previous = {
    DRIVER_ARRIVED: "MATCHED",
    STARTED: "DRIVER_ARRIVED",
    COMPLETED: "STARTED",
  }[next];
  if (!previous)
    throw new ApiError(400, "Choose arrival, pickup, or drop-off.");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ride = await RideRequest.findById(request.params.id).session(
        session,
      );
      if (!ride || ride.status !== previous)
        throw new ApiError(
          409,
          "Passenger status changed or transition is invalid.",
        );
      const pool = await Pool.findOne({
        _id: ride.pool,
        driver: request.driver.id,
        status: { $in: activeStatuses },
      }).session(session);
      if (!pool) throw new ApiError(404, "Booking is not in your active pool.");
      if (!pool.routeCode)
        throw new ApiError(
          409,
          "Use the older pool controls for this legacy trip.",
        );
      const member = pool.members.find(
        (item) => String(item.request) === ride.id,
      );
      if (!member || member.status !== previous)
        throw new ApiError(409, "Booking membership is inconsistent.");
      const now = new Date();
      // Manual buttons declare arrival/boarding/drop-off; no GPS or automatic status guessing.
      if (next === "DRIVER_ARRIVED") {
        // Lock the chat document against concurrent message writes, then delete it.
        await RideChat.findOneAndDelete({ ride: ride.id }, { session });
        ride.arrivedAt = now;
      }
      if (pool.routeCode === "graph-v1") {
        // All location/progress changes serialize with acceptance via the Driver lock.
        await Driver.findOneAndUpdate(
          { _id: request.driver.id },
          { $set: { lastOfferAcceptedAt: new Date() } },
          { session },
        );
        const stopIndex =
          next === "COMPLETED" ? member.destinationIndex : member.pickupIndex;
        if (stopIndex < pool.currentStopIndex)
          throw new ApiError(
            409,
            "This action would move behind the current stop.",
          );
        // Do not pass an assigned pickup, or an onboard Passenger's drop-off.
        for (const other of pool.members) {
          if (
            String(other.request) === ride.id ||
            ["COMPLETED", "CANCELLED"].includes(other.status)
          )
            continue;
          const requiredStop =
            other.status === "STARTED"
              ? other.destinationIndex
              : other.pickupIndex;
          if (requiredStop < stopIndex)
            throw new ApiError(409, "Handle the earlier Passenger stop first.");
        }
        if (next === "STARTED" || next === "COMPLETED") {
          pool.currentStopIndex = stopIndex;
          await Driver.updateOne(
            { _id: request.driver.id },
            {
              $set: {
                currentArea: pool.routeStops[stopIndex],
                locationSource: "trip-action",
                locationUpdatedAt: now,
              },
            },
            { session },
          );
        }
      }
      if (next === "STARTED") {
        if (pool.occupiedSeats + ride.seats > pool.capacity)
          throw new ApiError(409, "Drop off passengers before boarding more.");
        pool.occupiedSeats += ride.seats;
        pool.status = "STARTED";
        ride.pickedUpAt = now;
      }
      if (next === "COMPLETED") {
        pool.occupiedSeats -= ride.seats;
        ride.droppedOffAt = now;
        ride.finalFarePaisa = hasSharedSegment(pool, ride)
          ? ride.pooledFarePaisa
          : ride.soloFarePaisa;
        ride.paymentStatus = "due";
        let paymentEvent = "PAYMENT_DUE";
        if (ride.paymentMethod === "teslapay") {
          ride.paymentStatus = "paid";
          ride.paidAt = now;
          paymentEvent = "PAYMENT_PAID";
        }
        ride.history.push({ status: paymentEvent, at: now });
      }
      member.status = next;
      ride.status = next;
      ride.history.push({ status: next, at: now });
      pool.history.push({
        status: next,
        at: now,
        request: ride.id,
        passengerName: ride.passengerName,
        seats: ride.seats,
      });
      if (
        pool.members.every((item) =>
          ["COMPLETED", "CANCELLED"].includes(item.status),
        )
      )
        pool.status = "COMPLETED";
      await pool.save({ session });
      await ride.save({ session });
    });
  } finally {
    await session.endSession();
  }
  if (next === "DRIVER_ARRIVED")
    notifyChatClosed(request.app.locals.io, [request.params.id]);
  response.json(
    new ApiResponse(
      200,
      { ride: publicRide(await populatedRide(request.params.id)) },
      "Passenger status updated.",
    ),
  );
});

export const advancePool = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid pool ID.");
  const next = request.body?.status;
  const previous = {
    DRIVER_ARRIVED: "MATCHED",
    STARTED: "DRIVER_ARRIVED",
    COMPLETED: "STARTED",
  }[next];
  if (!previous) throw new ApiError(400, "Choose the next trip status.");
  const session = await mongoose.startSession();
  let closedRideIds = [];
  try {
    await session.withTransaction(async () => {
      const pool = await Pool.findOneAndUpdate(
        { _id: request.params.id, driver: request.driver.id, status: previous },
        {
          $set: { status: next },
          $push: { history: { status: next, at: new Date() } },
        },
        { session, returnDocument: "after" },
      );
      if (!pool)
        throw new ApiError(
          409,
          "Trip status changed or this is not your pool.",
        );
      if (pool.routeCode)
        throw new ApiError(
          409,
          "Update each Passenger separately in this route-based pool.",
        );
      if (next === "DRIVER_ARRIVED") {
        closedRideIds = pool.members.map((member) => String(member.request));
        await RideChat.deleteMany({ pool: pool.id }, { session });
      }
      const now = new Date();
      const shared = pool.members.length > 1;
      for (const member of pool.members) {
        const ride = await RideRequest.findById(member.request).session(
          session,
        );
        if (!ride || ride.status !== previous)
          throw new ApiError(409, "Passenger ride status is inconsistent.");
        const simulatedPay = (ride.paymentMethod || "cash") === "teslapay";
        const changes = { status: next };
        const events = [{ status: next, at: now }];
        if (next === "COMPLETED") {
          changes.finalFarePaisa = ride.soloFarePaisa;
          if (shared) changes.finalFarePaisa = ride.pooledFarePaisa;
          changes.paymentStatus = "due";
          let paymentEvent = "PAYMENT_DUE";
          if (simulatedPay) {
            changes.paymentStatus = "paid";
            changes.paidAt = now;
            paymentEvent = "PAYMENT_PAID";
          }
          events.push({ status: paymentEvent, at: now });
        }
        await RideRequest.updateOne(
          { _id: ride.id, status: previous },
          { $set: changes, $push: { history: { $each: events } } },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  if (closedRideIds.length)
    notifyChatClosed(request.app.locals.io, closedRideIds);
  const pool = await Pool.findById(request.params.id).populate(
    "members.passenger",
    "name",
  );
  response.json(
    new ApiResponse(200, { pool: publicPool(pool) }, "Trip status updated."),
  );
});

export const confirmCashPayment = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id))
    throw new ApiError(400, "Invalid ride ID.");
  const ride = await RideRequest.findById(request.params.id).populate("pool");
  if (!ride || String(ride.pool?.driver) !== request.driver.id)
    throw new ApiError(404, "Ride not found for this driver.");
  const now = new Date();
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await RideRequest.findOneAndUpdate(
        {
          _id: ride.id,
          status: "COMPLETED",
          paymentMethod: "cash",
          paymentStatus: "due",
        },
        {
          $set: { paymentStatus: "paid", paidAt: now },
          $push: { history: { status: "PAYMENT_PAID", at: now } },
        },
        { returnDocument: "after", session },
      );
      if (!updated)
        throw new ApiError(
          409,
          "Only completed cash rides awaiting payment can be confirmed.",
        );
    });
  } finally {
    await session.endSession();
  }
  if (!updated)
    throw new ApiError(
      409,
      "Only completed cash rides awaiting payment can be confirmed.",
    );
  response.json(
    new ApiResponse(
      200,
      { ride: publicRide(await populatedRide(updated.id)) },
      "Cash payment confirmed.",
    ),
  );
});
