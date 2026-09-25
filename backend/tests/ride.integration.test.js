import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { io as createClient } from "socket.io-client";
import app from "../app.js";
import { attachRideSockets } from "../socket.js";
import Driver from "../models/Driver.js";
import DriverReview from "../models/DriverReview.js";
import Passenger from "../models/Passenger.js";
import Pool from "../models/Pool.js";
import RideChat from "../models/RideChat.js";
import RideRequest from "../models/RideRequest.js";

test("Atlas ride flow: online offers, pooled seats, concurrent last seat, lifecycle and fares", { skip: process.env.RUN_ATLAS_INTEGRATION !== "true" }, async () => {
  const dbName = `dhaka_tesla_pool_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const mongoUri = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
  const oldAdminUsername = process.env.ADMIN_USERNAME;
  const oldAdminPassword = process.env.ADMIN_PASSWORD;
  let server;
  let io;
  try {
    await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 10000 });
    await Promise.all([Passenger.init(), Driver.init(), Pool.init(), RideRequest.init(), RideChat.init(), DriverReview.init()]);
    app.locals.databaseReady = true;
    server = createServer(app);
    io = attachRideSockets(server, app);
    server.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const passengers = await Passenger.create(["Nusrat", "Rafiq", "Shirin", "Mina"].map((name, index) => ({ name, username: `${name.toLowerCase()}_${dbName}`, email: `${name.toLowerCase()}_${dbName}@example.invalid`, phone: `0170000000${index}`, passwordHash: "test-only" })));
    const driver = await Driver.create({ name: "Jashim", username: `jashim_${dbName}`, email: `jashim_${dbName}@example.invalid`, phone: "01700000009", passwordHash: "test-only", licenseNumber: `TEST-${dbName}`, licenseExpiry: new Date("2035-12-31"), vehicleModel: "Model 3", vehicleRegistrationNumber: `CAR-${dbName}`, vehicleColor: "Green", passengerSeats: 3, serviceArea: "Banani", verificationStatus: "approved" });
    const tabAccount = await fetch(`${base}/passengers/me`, { headers: { Authorization: `Bearer ${passengers[1].generateAccessToken()}`, Cookie: `tesla_pool_session=${passengers[0].generateAccessToken()}` } });
    assert.equal((await tabAccount.json()).data.passenger.id, passengers[1].id, "Tab token must win over a different tab's shared cookie.");
    async function call(role, person, path, method = "GET", body) {
      const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${person.generateAccessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: (await response.json()).data };
    }

    assert.equal((await call("driver", driver, "/rides/offers")).data.offers.length, 0);
    assert.equal((await call("driver", driver, "/drivers/availability", "PATCH", { availability: "online", currentArea: "Banani" })).status, 200);
    assert.equal((await call("passenger", passengers[0], "/rides/nearby-drivers")).data.drivers.length, 1);
    const nusratQuote = (await call("passenger", passengers[0], "/rides/quote", "POST", { pickupArea: "Banani", destinationArea: "Mohakhali", seats: 1 })).data;
    const rafiqQuote = (await call("passenger", passengers[1], "/rides/quote", "POST", { pickupArea: "Banani", destinationArea: "Gulshan 1", seats: 1 })).data;
    assert.equal(nusratQuote.soloFarePaisa, 9000);
    assert.equal(rafiqQuote.pooledFarePaisa, 7200);

    const first = await call("passenger", passengers[0], "/rides/requests", "POST", { pickupArea: "Banani", destinationArea: "Mohakhali", seats: 1, paymentMethod: "cash" });
    const second = await call("passenger", passengers[1], "/rides/requests", "POST", { pickupArea: "Banani", destinationArea: "Gulshan 1", seats: 1, paymentMethod: "teslapay" });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal((await call("driver", driver, "/rides/offers")).data.offers.length, 2);

    // One driver acceptance automatically groups compatible waiting requests.
    const matchStartedAt = performance.now();
    assert.equal((await call("driver", driver, `/rides/requests/${first.data.ride.id}/accept`, "POST")).status, 200);
    const matchDurationMs = Math.round(performance.now() - matchStartedAt);
    console.log(`Atlas matching response (first request + compatible waiting request): ${matchDurationMs} ms`);
    let current = (await call("driver", driver, "/rides/driver/current")).data.pool;
    assert.equal(current.capacity, 3);
    assert.equal(current.occupiedSeats, 2);
    assert.equal(current.members.length, 2);
    assert.equal((await call("passenger", passengers[2], "/rides/nearby-drivers")).data.drivers.length, 1);
    assert.equal((await call("passenger", passengers[1], "/rides/mine?view=active")).data.rides[0].status, "MATCHED");
    assert.equal(await RideChat.countDocuments({ pool: current.id, status: "open" }), 2);
    const passengerSocket = createClient(`http://127.0.0.1:${server.address().port}`, { autoConnect: false, transports: ["websocket"], auth: { role: "passenger", accessToken: passengers[0].generateAccessToken() }, extraHeaders: { Cookie: `tesla_pool_session=${passengers[1].generateAccessToken()}` } });
    const driverSocket = createClient(`http://127.0.0.1:${server.address().port}`, { autoConnect: false, transports: ["websocket"], auth: { role: "driver", accessToken: driver.generateAccessToken() } });
    const emit = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
    try {
      for (const socket of [passengerSocket, driverSocket]) {
        socket.connect();
        await Promise.race([new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); }), new Promise((_, reject) => setTimeout(() => reject(new Error("Socket connection timed out")), 5000))]);
      }
      assert.equal((await emit(passengerSocket, "chat:join", { rideId: first.data.ride.id })).ok, true);
      assert.equal((await emit(driverSocket, "chat:join", { rideId: first.data.ride.id })).ok, true);
      assert.equal((await emit(passengerSocket, "chat:join", { rideId: second.data.ride.id })).ok, false);
      const received = new Promise((resolve) => driverSocket.once("chat:message", resolve));
      assert.equal((await emit(passengerSocket, "chat:send", { rideId: first.data.ride.id, text: "I am at Road 11" })).ok, true);
      assert.equal((await received).text, "I am at Road 11");
      assert.equal((await emit(driverSocket, "chat:send", { rideId: first.data.ride.id, text: "On my way" })).ok, true);
      assert.equal((await RideChat.findOne({ ride: first.data.ride.id })).messages.length, 2);
    } finally { passengerSocket.disconnect(); driverSocket.disconnect(); }

    // Two new passengers contend for the last seat; exactly one may enter.
    const lastSeat = await Promise.all([2, 3].map((index) => call("passenger", passengers[index], "/rides/requests", "POST", { pickupArea: "Banani", destinationArea: "Gulshan 1", seats: 1, paymentMethod: "cash" })));
    assert.deepEqual(lastSeat.map((result) => result.status), [201, 201]);
    current = (await call("driver", driver, "/rides/driver/current")).data.pool;
    assert.equal(current.occupiedSeats, 3);
    assert.equal(current.members.length, 3);
    assert.equal((await call("passenger", passengers[0], "/rides/nearby-drivers")).data.drivers.length, 0);
    const matched = await Promise.all([2, 3].map((index) => call("passenger", passengers[index], "/rides/mine?view=active")));
    assert.deepEqual(matched.map((result) => result.data.rides[0].status).sort(), ["MATCHED", "REQUESTED"]);
    const losingIndex = matched.findIndex((result) => result.data.rides[0].status === "REQUESTED") + 2;
    const winningIndex = losingIndex === 2 ? 3 : 2;
    assert.equal(JSON.stringify((await call("passenger", passengers[0], "/rides/mine")).data).includes(passengers[winningIndex].name), false);

    process.env.ADMIN_USERNAME = "integration_admin";
    process.env.ADMIN_PASSWORD = "integration-test-password-123";
    const adminLogin = await fetch(`${base}/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }) });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.getSetCookie().find((value) => value.startsWith("tesla_pool_admin_session=")).split(";")[0];
    async function adminStatus(status) { return fetch(`${base}/admin/drivers/${driver.id}/verification`, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ status }) }); }
    assert.equal((await adminStatus("unverified")).status, 200);
    assert.equal((await call("driver", driver, "/rides/offers")).data.offers.length, 0);
    assert.equal((await call("passenger", passengers[0], "/rides/nearby-drivers")).data.drivers.length, 0);
    for (const status of ["DRIVER_ARRIVED", "STARTED", "COMPLETED"]) {
      assert.equal((await call("driver", driver, `/rides/pools/${current.id}/status`, "PATCH", { status })).status, 200);
      if (status === "DRIVER_ARRIVED") assert.equal(await RideChat.countDocuments({ pool: current.id }), 0, "Arrival must remove all pool chats, before payment.");
    }
    assert.equal(await RideChat.countDocuments({ ride: second.data.ride.id }), 0);
    assert.equal(await RideChat.countDocuments({ ride: first.data.ride.id }), 0);
    const nusrat = (await call("passenger", passengers[0], "/rides/mine?view=history")).data.rides[0];
    const rafiq = (await call("passenger", passengers[1], "/rides/mine?view=history")).data.rides[0];
    assert.equal(nusrat.status, "COMPLETED");
    assert.equal(nusrat.currentFarePaisa, 7200);
    assert.equal(nusrat.paymentStatus, "due");
    assert.equal(rafiq.currentFarePaisa, 7200);
    assert.equal(rafiq.paymentStatus, "paid");
    assert.ok(rafiq.paidAt);
    assert.equal((await call("passenger", passengers[0], `/rides/requests/${nusrat.id}/confirm-cash`, "POST")).status, 401);
    assert.equal((await call("driver", driver, `/rides/requests/${nusrat.id}/confirm-cash`, "POST")).status, 200);
    assert.equal(await RideChat.countDocuments({ ride: first.data.ride.id }), 0);
    assert.equal((await call("driver", driver, `/rides/requests/${nusrat.id}/confirm-cash`, "POST")).status, 409);
    const paid = (await call("passenger", passengers[0], "/rides/mine?view=history")).data.rides[0];
    assert.equal(paid.paymentStatus, "paid");
    assert.ok(paid.history.some((event) => event.status === "PAYMENT_PAID"));
    const driverHistory = (await call("driver", driver, "/rides/driver/history")).data.pools[0];
    assert.equal(driverHistory.members.length, 3);
    assert.equal(driverHistory.members.find((member) => member.requestId === nusrat.id).paymentStatus, "paid");
    assert.equal((await call("passenger", passengers[1], `/rides/requests/${nusrat.id}/review`, "POST", { rating: 5, comment: "Great driver" })).status, 403);
    assert.equal((await call("passenger", passengers[0], `/rides/requests/${nusrat.id}/review`, "POST", { rating: 6, comment: "Great driver" })).status, 400);
    assert.equal((await call("passenger", passengers[0], `/rides/requests/${nusrat.id}/review`, "POST", { rating: 5, comment: "Great driver" })).status, 201);
    assert.equal((await call("passenger", passengers[0], `/rides/requests/${nusrat.id}/review`, "POST", { rating: 4, comment: "Again" })).status, 409);
    const driverReview = (await call("driver", driver, "/drivers/reviews")).data.reviews[0];
    assert.equal(driverReview.passengerName, "Nusrat");
    assert.equal("passengerId" in driverReview, false);
    const adminReviews = await fetch(`${base}/admin/drivers/${driver.id}/reviews`, { headers: { Cookie: adminCookie } });
    const adminReview = (await adminReviews.json()).data.reviews[0];
    assert.equal(adminReview.rating, 5);
    assert.equal(adminReview.passengerName, "Nusrat");
    assert.equal("passengerId" in adminReview, false);
    assert.equal((await call("passenger", passengers[losingIndex], `/rides/requests/${lastSeat[losingIndex - 2].data.ride.id}/cancel`, "PATCH")).status, 200);

    await Passenger.updateOne({ _id: passengers[0].id }, { $set: { name: "Nusrat Changed" } });
    await Driver.updateOne({ _id: driver.id }, { $set: { name: "Jashim Changed" } });
    assert.equal((await call("driver", driver, "/drivers/reviews")).data.reviews[0].passengerName, "Nusrat");
    const oldRide = (await call("passenger", passengers[0], "/rides/mine?view=history")).data.rides[0];
    assert.equal(oldRide.driverName, "Jashim");
    assert.equal((await call("driver", driver, "/rides/driver/history")).data.pools[0].members[0].passengerName, "Nusrat");

    const savedRates = await fetch(`${base}/admin/fare-settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ baseFarePaisa: 6000, perKmPaisa: 2500, sharedDiscountPercent: 25 }) });
    assert.equal(savedRates.status, 200);
    const newQuote = (await call("passenger", passengers[0], "/rides/quote", "POST", { pickupArea: "Banani", destinationArea: "Mohakhali", seats: 1 })).data;
    assert.equal(newQuote.soloFarePaisa, 11000);
    assert.equal(newQuote.pooledFarePaisa, 8250);
    assert.equal((await call("passenger", passengers[0], "/rides/mine?view=history")).data.rides[0].currentFarePaisa, 7200);

    assert.equal((await adminStatus("approved")).status, 200);
    assert.equal((await call("driver", driver, "/drivers/availability", "PATCH", { availability: "online", currentArea: "Banani" })).status, 200);
    const nextA = await call("passenger", passengers[0], "/rides/requests", "POST", { pickupArea: "Banani", destinationArea: "Mohakhali", seats: 1 });
    assert.equal(nextA.data.ride.soloFarePaisa, 11000);
    assert.equal(nextA.data.ride.fareRule.sharedDiscountPercent, 25);
    assert.equal((await call("driver", driver, `/rides/requests/${nextA.data.ride.id}/accept`, "POST")).status, 200);
    const nextB = await call("passenger", passengers[losingIndex], "/rides/requests", "POST", { pickupArea: "Banani", destinationArea: "Gulshan 1", seats: 1 });
    assert.equal(nextB.status, 201);
    assert.equal(nextB.data.ride.status, "MATCHED");
    assert.equal(await RideChat.countDocuments({ ride: nextB.data.ride.id }), 1);
    assert.equal((await call("passenger", passengers[losingIndex], `/rides/requests/${nextB.data.ride.id}/cancel`, "PATCH")).status, 200);
    assert.equal(await RideChat.countDocuments({ ride: nextB.data.ride.id }), 0, "Cancellation must remove messages without payment.");
    const reduced = (await call("driver", driver, "/rides/driver/current")).data.pool;
    assert.equal(reduced.occupiedSeats, 1);
    for (const status of ["DRIVER_ARRIVED", "STARTED", "COMPLETED"]) assert.equal((await call("driver", driver, `/rides/pools/${reduced.id}/status`, "PATCH", { status })).status, 200);
    const solo = (await call("passenger", passengers[0], "/rides/mine?view=history")).data.rides[0];
    assert.equal(solo.currentFarePaisa, solo.soloFarePaisa);
    assert.equal(solo.paymentStatus, "due");
    assert.equal((await call("passenger", passengers[0], "/rides/mine?view=active")).data.rides.length, 0);
    assert.equal((await call("driver", driver, "/drivers/availability", "PATCH", { availability: "offline", currentArea: "Banani" })).status, 200);
  } finally {
    if (oldAdminUsername === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = oldAdminUsername;
    if (oldAdminPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = oldAdminPassword;
    if (io) await new Promise((resolve) => io.close(resolve));
    else if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      if (!dbName.startsWith("dhaka_tesla_pool_test_")) throw new Error("Refusing to remove an unexpected test database.");
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
