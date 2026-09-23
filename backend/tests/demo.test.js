import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";
import { seedDemoAccounts, publicDemoAccounts } from "../config/demoAccounts.js";

test("opt-in demo seeding creates one Passenger and one Driver with working autofill credentials", async () => {
  const originals = {
    flag: process.env.ENABLE_DEMO_ACCOUNTS,
    passengerFindOne: Passenger.findOne,
    passengerExists: Passenger.exists,
    passengerCreate: Passenger.create,
    driverFindOne: Driver.findOne,
    driverExists: Driver.exists,
    driverCreate: Driver.create,
  };
  const created = { passengers: [], drivers: [] };

  try {
    process.env.ENABLE_DEMO_ACCOUNTS = "true";
    Passenger.findOne = async () => null;
    Driver.findOne = async () => null;
    Passenger.exists = async () => false;
    Driver.exists = async () => false;
    Passenger.create = async (data) => { created.passengers.push(data); return data; };
    Driver.create = async (data) => { created.drivers.push(data); return data; };

    await seedDemoAccounts();
    const exposed = publicDemoAccounts();
    assert.equal(created.passengers.length, 4);
    assert.equal(created.drivers.length, 4);
    assert.equal(created.passengers[0].isDemo, true);
    assert.equal(created.passengers[0].phone, "01700000001");
    assert.equal(created.drivers[0].isDemo, true);
    assert.equal(created.drivers[0].vehicleModel, "Model 3");
    assert.equal(created.drivers.find((driver) => driver.name === "Jashim").passengerSeats, 3);
    assert.equal(await bcrypt.compare(exposed.passenger.password, created.passengers[0].passwordHash), true);
    assert.equal(await bcrypt.compare(exposed.driver.password, created.drivers[0].passwordHash), true);

    process.env.ENABLE_DEMO_ACCOUNTS = "false";
    assert.equal(publicDemoAccounts(), null);
  } finally {
    if (originals.flag === undefined) delete process.env.ENABLE_DEMO_ACCOUNTS;
    else process.env.ENABLE_DEMO_ACCOUNTS = originals.flag;
    Passenger.findOne = originals.passengerFindOne;
    Passenger.exists = originals.passengerExists;
    Passenger.create = originals.passengerCreate;
    Driver.findOne = originals.driverFindOne;
    Driver.exists = originals.driverExists;
    Driver.create = originals.driverCreate;
  }
});
