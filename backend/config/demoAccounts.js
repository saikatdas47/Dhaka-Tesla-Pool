import bcrypt from "bcryptjs";
import Passenger from "../models/Passenger.js";
import Driver from "../models/Driver.js";

// These are intentionally public, local-development-only credentials.
const demoAccounts = {
  passenger: { username: "demo_passenger", password: "DemoPassenger2026!" },
  driver: { username: "demo_driver", password: "DemoDriver2026!" },
};

export function demoAccountsEnabled() {
  return process.env.ENABLE_DEMO_ACCOUNTS === "true";
}

export function publicDemoAccounts() {
  return demoAccountsEnabled() ? demoAccounts : null;
}

async function createOrUpdateDemo(Model, role, profile) {
  const { username, password } = demoAccounts[role];
  const existingDemo = await Model.findOne({ isDemo: true });
  if (existingDemo) {
    if (role === "passenger" && !existingDemo.phone) await Model.updateOne({ _id: existingDemo.id }, { $set: { phone: "01700000001" } });
    return;
  }
  const named = await Model.findOne({ username });
  if (named) throw new Error(`Cannot seed ${role} demo: username is owned by another account.`);

  await Model.create({
    name: role === "passenger" ? "Passenger 1" : "Driver 1",
    username,
    email: `${username}@dhaka-tesla-pool.invalid`,
    ...(role === "passenger" ? { phone: "01700000001" } : {}),
    passwordHash: await bcrypt.hash(password, 12),
    emailVerifiedAt: new Date(),
    isDemo: true,
    ...profile,
  });
}

export async function seedDemoAccounts() {
  if (!demoAccountsEnabled()) return;
  await createOrUpdateDemo(Passenger, "passenger", {});
  await createOrUpdateDemo(Driver, "driver", {
    phone: "01700000000",
    licenseNumber: "DEMO-LICENCE-001",
    licenseExpiry: new Date("2035-12-31T00:00:00Z"),
    vehicleModel: "Model 3",
    vehicleRegistrationNumber: "DEMO-TESLA-001",
    vehicleColor: "White",
    passengerSeats: 4,
    serviceArea: "Banani, Dhaka",
  });
}
