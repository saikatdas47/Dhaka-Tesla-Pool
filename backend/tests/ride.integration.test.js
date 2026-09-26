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

test(
  "Atlas graph pooling: shortest path, forward extension, automatic progress, concurrency, chat, payment and reviews",
  { skip: process.env.RUN_ATLAS_INTEGRATION !== "true", timeout: 180000 },
  async () => {
    // All writes and cleanup are confined to this disposable, uniquely named database.
    const dbName =
      "dhaka_tesla_pool_test_" + randomUUID().replaceAll("-", "").slice(0, 12);
    let server, sockets;
    const clients = [];
    try {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || process.env.MONGODB_URI,
        { dbName, serverSelectionTimeoutMS: 10000 },
      );
      await Promise.all([
        Passenger.init(),
        Driver.init(),
        Pool.init(),
        RideRequest.init(),
        RideChat.init(),
        DriverReview.init(),
      ]);
      app.locals.databaseReady = true;
      server = createServer(app);
      sockets = attachRideSockets(server, app);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const origin = "http://127.0.0.1:" + server.address().port;
      const people = await Passenger.create(
        ["Nusrat", "Rafiq", "Shirin", "Mina", "Runa", "Tania", "Salma"].map(
          (name, index) => ({
            name,
            username: name.toLowerCase() + "_" + dbName,
            email: name.toLowerCase() + "@example.invalid",
            phone: "0170000000" + index,
            passwordHash: "test-only",
          }),
        ),
      );
      const driver = await Driver.create({
        name: "Jashim",
        username: "jashim_" + dbName,
        email: "jashim@example.invalid",
        phone: "01700000009",
        passwordHash: "test-only",
        licenseNumber: dbName,
        licenseExpiry: new Date("2035-12-31"),
        vehicleModel: "Model 3",
        vehicleRegistrationNumber: "CAR-" + dbName,
        vehicleColor: "Green",
        passengerSeats: 3,
        serviceArea: "Bashundhara",
        verificationStatus: "approved",
      });
      const otherDriver = await Driver.create({
        name: "Karim",
        username: "karim_" + dbName,
        email: "karim@example.invalid",
        phone: "01700000008",
        passwordHash: "test-only",
        licenseNumber: "OTHER-" + dbName,
        licenseExpiry: new Date("2035-12-31"),
        vehicleModel: "Model 3",
        vehicleRegistrationNumber: "OTHER-" + dbName,
        vehicleColor: "White",
        passengerSeats: 3,
        serviceArea: "Bashundhara",
        verificationStatus: "pending",
      });
      async function call(person, path, method = "GET", body) {
        const response = await fetch(origin + "/api" + path, {
          method,
          headers: {
            Authorization: "Bearer " + person.generateAccessToken(),
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const result = await response.json();
        return {
          status: response.status,
          data: result.data,
          message: result.message,
        };
      }
      async function ok(person, path, method = "GET", body, expected = 200) {
        const result = await call(person, path, method, body);
        assert.equal(result.status, expected, result.message);
        return result.data;
      }
      async function create(
        person,
        pickupArea,
        destinationArea,
        seats = 1,
        paymentMethod = "cash",
        routeCode = "central",
      ) {
        return (
          await ok(
            person,
            "/rides/requests",
            "POST",
            { pickupArea, destinationArea, seats, paymentMethod, routeCode },
            201,
          )
        ).ride;
      }
      async function accept(ride) {
        return ok(driver, "/rides/requests/" + ride.id + "/accept", "POST");
      }
      async function step(ride, status) {
        return ok(driver, "/rides/requests/" + ride.id + "/status", "PATCH", {
          status,
        });
      }
      async function current() {
        return (await ok(driver, "/rides/driver/current")).pool;
      }
      async function offers() {
        return (await ok(driver, "/rides/offers")).offers.map(
          (ride) => ride.id,
        );
      }
      async function save(currentArea, extra = {}) {
        return ok(driver, "/drivers/availability", "PATCH", {
          availability: "online",
          currentArea,
          ...extra,
        });
      }
      assert.deepEqual(await offers(), []);
      assert.equal(
        (
          await call(otherDriver, "/drivers/availability", "PATCH", {
            availability: "online",
            currentArea: "Bashundhara",
          })
        ).status,
        403,
      );
      await save("Bashundhara");
      const first = await create(people[0], "Bashundhara", "Mohakhali");
      const second = await create(
        people[1],
        "Banani",
        "Dhanmondi",
        1,
        "teslapay",
      );
      const third = await create(people[2], "Gulshan 1", "Dhanmondi");
      const fourth = await create(people[3], "Gulshan 1", "Dhanmondi");
      const opposite = await create(people[4], "Banani", "Bashundhara");
      const outside = await create(
        people[5],
        "Mirpur",
        "Uttara",
        1,
        "cash",
        "north",
      );
      assert.deepEqual(new Set(await offers()), new Set([first.id]));
      const startedAt = performance.now();
      await accept(first);
      console.log(
        "Atlas single manual accept response: " +
          Math.round(performance.now() - startedAt) +
          " ms (not a latency guarantee)",
      );
      assert.equal(
        (await current()).members.length,
        1,
        "No automatic acceptance of other passengers.",
      );
      assert.equal((await RideRequest.findById(second.id)).status, "REQUESTED");
      await accept(second); // Future Banani pickup accepted while saved at Bashundhara.
      assert.equal((await current()).occupiedSeats, 0);
      assert.equal(await RideChat.countDocuments({ status: "open" }), 2);
      assert.equal(
        (
          await call(driver, "/drivers/availability", "PATCH", {
            availability: "offline",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(driver, "/drivers/availability", "PATCH", {
            availability: "online",
            currentArea: "Banani",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            driver,
            "/rides/requests/" + opposite.id + "/accept",
            "POST",
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(
            driver,
            "/rides/requests/" + outside.id + "/accept",
            "POST",
          )
        ).status,
        409,
      );
      const raced = await Promise.all(
        [third, fourth].map((ride) =>
          call(driver, "/rides/requests/" + ride.id + "/accept", "POST"),
        ),
      );
      assert.deepEqual(raced.map((result) => result.status).sort(), [200, 409]);
      let pool = await current();
      assert.equal(Math.max(...pool.segmentSeats), 3);
      const winner = raced[0].status === 200 ? third : fourth;
      const loser = raced[0].status === 200 ? fourth : third;
      assert.equal(
        (
          await call(
            people[1],
            "/rides/requests/" + first.id + "/cancel",
            "PATCH",
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await call(
            otherDriver,
            "/rides/requests/" + first.id + "/status",
            "PATCH",
            { status: "DRIVER_ARRIVED" },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await call(
            driver,
            "/rides/requests/" + first.id + "/status",
            "PATCH",
            { status: "COMPLETED" },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await call(driver, "/rides/pools/" + pool.id + "/status", "PATCH", {
            status: "DRIVER_ARRIVED",
          })
        ).status,
        409,
      );

      function emit(client, event, data) {
        return new Promise((resolve, reject) =>
          client
            .timeout(5000)
            .emit(event, data, (error, result) =>
              error ? reject(error) : resolve(result),
            ),
        );
      }
      async function connect(person, role) {
        const client = createClient(origin, {
          autoConnect: false,
          transports: ["websocket"],
          auth: { role, accessToken: person.generateAccessToken() },
          timeout: 5000,
        });
        clients.push(client);
        await new Promise((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
          client.connect();
        });
        return client;
      }
      const passengerSocket = await connect(people[0], "passenger");
      const driverSocket = await connect(driver, "driver");
      assert.equal(
        (await emit(passengerSocket, "chat:join", { rideId: first.id })).ok,
        true,
      );
      assert.equal(
        (await emit(passengerSocket, "chat:join", { rideId: second.id })).ok,
        false,
      );
      assert.equal(
        (await emit(driverSocket, "chat:join", { rideId: first.id })).ok,
        true,
      );
      assert.equal(
        (
          await emit(passengerSocket, "chat:send", {
            rideId: first.id,
            text: "Waiting at pickup",
          })
        ).ok,
        true,
      );
      assert.equal(
        (await RideChat.findOne({ ride: first.id })).messages.length,
        1,
      );
      await step(first, "DRIVER_ARRIVED");
      assert.equal(await RideChat.countDocuments({ ride: first.id }), 0);
      assert.equal(await RideChat.countDocuments({ ride: second.id }), 1);
      assert.equal(
        (
          await emit(passengerSocket, "chat:send", {
            rideId: first.id,
            text: "Closed",
          })
        ).ok,
        false,
      );
      await step(first, "STARTED");
      assert.equal(
        (
          await call(
            people[0],
            "/rides/requests/" + first.id + "/cancel",
            "PATCH",
          )
        ).status,
        409,
      );
      assert.equal(
        (await emit(driverSocket, "chat:join", { rideId: second.id })).ok,
        true,
        "Other passenger chat stays open after pool starts.",
      );
      driverSocket.disconnect();
      driverSocket.connect();
      await new Promise((resolve, reject) => {
        driverSocket.once("connect", resolve);
        driverSocket.once("connect_error", reject);
      });
      assert.equal(
        (await emit(driverSocket, "chat:join", { rideId: second.id })).ok,
        true,
      );

      const behind = await create(people[6], "Bashundhara", "Banani");
      await step(second, "DRIVER_ARRIVED");
      await step(second, "STARTED");
      assert.equal((await Driver.findById(driver.id)).currentArea, "Banani");
      assert.equal((await offers()).includes(behind.id), false);
      assert.equal(
        (await RideRequest.findById(first.id)).status,
        "STARTED",
        "Area updates preserve accepted membership.",
      );
      assert.equal(
        (
          await call(driver, "/drivers/availability", "PATCH", {
            availability: "online",
            currentArea: "Bashundhara",
          })
        ).status,
        409,
      );
      await step(winner, "DRIVER_ARRIVED");
      await step(winner, "STARTED");
      assert.equal((await current()).occupiedSeats, 3);
      await step(first, "COMPLETED");
      assert.equal((await current()).occupiedSeats, 2);
      assert.equal(
        (await RideRequest.findById(first.id)).finalFarePaisa,
        Math.round(first.soloFarePaisa * 0.8),
      );
      await ok(driver, "/rides/requests/" + first.id + "/confirm-cash", "POST");
      assert.equal(
        (await RideRequest.findById(first.id)).paymentStatus,
        "paid",
      );
      await step(second, "COMPLETED");
      await step(winner, "COMPLETED");
      assert.equal(await current(), null);
      assert.equal(
        (await RideRequest.findById(second.id)).paymentStatus,
        "paid",
      );
      const passengerHistory = (await ok(people[0], "/rides/mine?view=history"))
        .rides;
      assert.equal(passengerHistory.length, 1);
      assert.equal(Object.hasOwn(passengerHistory[0], "members"), false);
      assert.equal(
        (
          await call(
            people[1],
            "/rides/requests/" + first.id + "/review",
            "POST",
            { rating: 5, comment: "Wrong owner" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            people[0],
            "/rides/requests/" + first.id + "/review",
            "POST",
            { rating: 6, comment: "Invalid" },
          )
        ).status,
        400,
      );
      await ok(
        people[0],
        "/rides/requests/" + first.id + "/review",
        "POST",
        { rating: 5, comment: "Good shared journey" },
        201,
      );
      assert.equal(
        (
          await call(
            people[0],
            "/rides/requests/" + first.id + "/review",
            "POST",
            { rating: 5, comment: "Duplicate" },
          )
        ).status,
        409,
      );
      assert.equal(
        (await DriverReview.findOne({ ride: first.id })).passengerName,
        "Nusrat",
      );

      // Free the waiting requests, then test non-overlapping reservations and reuse.
      for (const [person, ride] of [
        [people[2], third],
        [people[3], fourth],
        [people[4], opposite],
        [people[5], outside],
        [people[6], behind],
      ]) {
        if ((await RideRequest.findById(ride.id)).status === "REQUESTED")
          await ok(person, "/rides/requests/" + ride.id + "/cancel", "PATCH");
      }
      await save("Bashundhara");
      const early = await create(people[0], "Bashundhara", "Mohakhali", 3);
      const late = await create(people[1], "Mohakhali", "Dhanmondi", 3);
      await accept(early);
      await step(early, "DRIVER_ARRIVED");
      await step(early, "STARTED");
      await accept(late);
      assert.equal(
        (await current()).status,
        "STARTED",
        "Future pickups can join a moving pool.",
      );
      pool = await current();
      assert.equal(
        pool.members.reduce((sum, member) => sum + member.seats, 0),
        6,
      );
      assert.deepEqual(pool.segmentSeats, [3, 3, 3, 3, 3]);
      await step(late, "DRIVER_ARRIVED");
      assert.equal(
        (
          await call(
            driver,
            "/rides/requests/" + late.id + "/status",
            "PATCH",
            { status: "STARTED" },
          )
        ).status,
        409,
      );
      await step(early, "COMPLETED");
      await step(late, "STARTED");
      assert.equal(
        (await RideRequest.findById(early.id)).finalFarePaisa,
        early.soloFarePaisa,
        "Adjacent non-overlapping bookings are not shared.",
      );
      await step(late, "COMPLETED");
      assert.equal((await Driver.findById(driver.id)).currentArea, "Dhanmondi");
      await save("Banani");
      const cancelled = await create(people[0], "Banani", "Farmgate", 2);
      await accept(cancelled);
      await ok(
        people[0],
        "/rides/requests/" + cancelled.id + "/cancel",
        "PATCH",
      );
      assert.equal(await current(), null);
      assert.equal(await RideChat.countDocuments({ ride: cancelled.id }), 0);
      assert.deepEqual(
        (await Pool.findOne({ "members.request": cancelled.id })).segmentSeats,
        [0, 0, 0],
      );
      // User's Mirpur → Mohakhali, Farmgate → Bashundhara, Gulshan → Bashundhara story.
      await save("Mirpur");
      const mirpur = await create(people[0], "Mirpur", "Mohakhali");
      const farmgate = await create(people[1], "Farmgate", "Bashundhara");
      await accept(mirpur);
      assert.deepEqual((await current()).routeStops, [
        "Mirpur",
        "Agargaon",
        "Farmgate",
        "Mohakhali",
      ]);
      const preview = (await ok(driver, "/rides/offers")).offers.find(
        (offer) => offer.id === farmgate.id,
      );
      assert.deepEqual(preview.extensionStops, [
        "Gulshan 1",
        "Banani",
        "Bashundhara",
      ]);
      assert.equal(preview.addedKm, 8);
      await accept(farmgate);
      await step(mirpur, "DRIVER_ARRIVED");
      await step(mirpur, "STARTED");
      assert.equal(
        (
          await call(
            driver,
            "/rides/requests/" + mirpur.id + "/status",
            "PATCH",
            { status: "COMPLETED" },
          )
        ).status,
        409,
        "Do not skip the Farmgate pickup.",
      );
      await step(farmgate, "DRIVER_ARRIVED");
      await step(farmgate, "STARTED");
      await step(mirpur, "COMPLETED");
      assert.equal((await Driver.findById(driver.id)).currentArea, "Mohakhali");
      const gulshan = await create(people[2], "Gulshan 1", "Bashundhara");
      await accept(gulshan);
      await step(gulshan, "DRIVER_ARRIVED");
      await step(gulshan, "STARTED");
      await step(farmgate, "COMPLETED");
      await step(gulshan, "COMPLETED");
      assert.equal(
        (await Driver.findById(driver.id)).currentArea,
        "Bashundhara",
      );
      assert.equal(await current(), null);
      await ok(driver, "/drivers/availability", "PATCH", {
        availability: "offline",
      });
      assert.deepEqual(await offers(), []);
    } finally {
      for (const client of clients) client.disconnect();
      if (sockets) await new Promise((resolve) => sockets.close(resolve));
      else if (server) await new Promise((resolve) => server.close(resolve));
      if (
        mongoose.connection.readyState === 1 &&
        mongoose.connection.name === dbName
      )
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      app.locals.databaseReady = false;
    }
  },
);
