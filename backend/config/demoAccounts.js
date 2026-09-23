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
  const existing = await Model.findOne({ username });
  if (existing && !existing.isDemo) throw new Error(`Cannot seed ${role} demo: username is owned by a real account.`);

  const passwordHash = await bcrypt.hash(password, 12);
  if (existing) {
    await Model.updateOne({ _id: existing.id, isDemo: true }, { $set: { passwordHash, emailVerifiedAt: new Date() } });
  } else {
    await Model.create({
      name: role === "passenger" ? "Demo Passenger" : "Demo Driver",
      username,
      email: `${username}@dhaka-tesla-pool.invalid`,
      passwordHash,
      emailVerifiedAt: new Date(),
      isDemo: true,
      ...profile,
    });
  }
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
