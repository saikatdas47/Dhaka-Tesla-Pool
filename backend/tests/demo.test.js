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
    passengerCreate: Passenger.create,
    driverFindOne: Driver.findOne,
    driverCreate: Driver.create,
  };
  const created = {};

  try {
    process.env.ENABLE_DEMO_ACCOUNTS = "true";
    Passenger.findOne = async () => null;
    Driver.findOne = async () => null;
    Passenger.create = async (data) => { created.passenger = data; return data; };
    Driver.create = async (data) => { created.driver = data; return data; };

    await seedDemoAccounts();
    const exposed = publicDemoAccounts();
    assert.equal(created.passenger.isDemo, true);
    assert.equal(created.passenger.phone, "01700000001");
    assert.equal(created.driver.isDemo, true);
    assert.equal(created.driver.vehicleModel, "Model 3");
    assert.equal(await bcrypt.compare(exposed.passenger.password, created.passenger.passwordHash), true);
    assert.equal(await bcrypt.compare(exposed.driver.password, created.driver.passwordHash), true);

    process.env.ENABLE_DEMO_ACCOUNTS = "false";
    assert.equal(publicDemoAccounts(), null);
  } finally {
    if (originals.flag === undefined) delete process.env.ENABLE_DEMO_ACCOUNTS;
    else process.env.ENABLE_DEMO_ACCOUNTS = originals.flag;
    Passenger.findOne = originals.passengerFindOne;
    Passenger.create = originals.passengerCreate;
    Driver.findOne = originals.driverFindOne;
    Driver.create = originals.driverCreate;
  }
});
