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
  if (existing) {
    if (!existing.isDemo) throw new Error(`Cannot seed ${role} demo: username is owned by another account.`);
    if (role === "passenger" && !existing.phone) await Model.updateOne({ _id: existing.id }, { $set: { phone: "01700000001" } });
    return;
  }

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

  const passengers = [
    { name: "Nusrat", username: "demo_nusrat", phone: "01700000011" },
    { name: "Rafiq", username: "demo_rafiq", phone: "01700000012" },
    { name: "Shirin", username: "demo_shirin", phone: "01700000013" },
  ];
  for (const passenger of passengers) {
    if (await Passenger.exists({ username: passenger.username })) continue;
    await Passenger.create({ ...passenger, email: `${passenger.username}@dhaka-tesla-pool.invalid`, passwordHash: await bcrypt.hash(demoAccounts.passenger.password, 12), emailVerifiedAt: new Date(), isDemo: true });
  }

  const drivers = [
    { name: "Jashim", username: "demo_jashim", phone: "01700000021", licenseNumber: "DEMO-LICENCE-021", vehicleRegistrationNumber: "DEMO-TESLA-021", vehicleColor: "Blue", passengerSeats: 3, verificationStatus: "approved" },
    { name: "Karim", username: "demo_karim", phone: "01700000022", licenseNumber: "DEMO-LICENCE-022", vehicleRegistrationNumber: "DEMO-TESLA-022", vehicleColor: "Silver", passengerSeats: 2, verificationStatus: "pending" },
    { name: "Farhana", username: "demo_farhana", phone: "01700000023", licenseNumber: "DEMO-LICENCE-023", vehicleRegistrationNumber: "DEMO-TESLA-023", vehicleColor: "Red", passengerSeats: 4, verificationStatus: "rejected" },
  ];
  for (const driver of drivers) {
    if (await Driver.exists({ username: driver.username })) continue;
    await Driver.create({ ...driver, email: `${driver.username}@dhaka-tesla-pool.invalid`, passwordHash: await bcrypt.hash(demoAccounts.driver.password, 12), emailVerifiedAt: new Date(), isDemo: true, licenseExpiry: new Date("2035-12-31T00:00:00Z"), vehicleModel: "Model 3", serviceArea: "Banani", availability: "offline", verificationHistory: [{ status: driver.verificationStatus, at: new Date(), by: "demo seed" }] });
  }
}
