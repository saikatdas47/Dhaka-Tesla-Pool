import "dotenv/config";
import mongoose from "mongoose";
import Passenger from "./models/Passenger.js";
import Driver from "./models/Driver.js";
import EmailOtp from "./models/EmailOtp.js";
import Pool from "./models/Pool.js";
import RideRequest from "./models/RideRequest.js";
import { durationMs, accessExpiry, refreshExpiry } from "./utils/tokenConfig.js";
import { seedDemoAccounts } from "./config/demoAccounts.js";
import app from "./app.js";

const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;

function checkConfiguration() {
  if (!mongoUri || mongoUri.includes("USERNAME:PASSWORD@CLUSTER_HOST")) {
    throw new Error("Set your MongoDB Atlas MONGODB_URI in backend/.env.");
  }
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || jwtSecret.startsWith("replace_this")) {
    throw new Error("Set a unique JWT_SECRET of at least 32 bytes in backend/.env.");
  }
  if (!process.env.AccessTokenSecret || Buffer.byteLength(process.env.AccessTokenSecret) < 32 || process.env.AccessTokenSecret.startsWith("replace_") || !process.env.RefreshTokenSecret || Buffer.byteLength(process.env.RefreshTokenSecret) < 32 || process.env.RefreshTokenSecret.startsWith("replace_") || process.env.AccessTokenSecret === process.env.RefreshTokenSecret || process.env.AccessTokenSecret === jwtSecret || process.env.RefreshTokenSecret === jwtSecret) {
    throw new Error("Set distinct AccessTokenSecret and RefreshTokenSecret values of at least 32 bytes.");
  }
  durationMs(accessExpiry());
  durationMs(refreshExpiry());
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.startsWith("your_") || !process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD.startsWith("your_") || !process.env.OTP_SECRET || process.env.OTP_SECRET.length < 16 || process.env.OTP_SECRET.startsWith("replace_")) {
    throw new Error("Set EMAIL_USER, EMAIL_APP_PASSWORD, and OTP_SECRET in backend/.env.");
  }

}

async function start() {
  checkConfiguration();
  const retryDelayMs = 10 * 1000;
  let stopping = false;
  let retryTimer;
  let databaseInitialized = false;

  mongoose.connection.on("disconnected", () => {
    app.locals.databaseReady = false;
  });
  mongoose.connection.on("connected", () => {
    if (databaseInitialized) app.locals.databaseReady = true;
  });

  async function connectDatabase() {
    if (stopping) return;
    try {
      await mongoose.connect(mongoUri, {
        dbName: process.env.MONGODB_DB_NAME || "dhaka_tesla_pool",
        serverSelectionTimeoutMS: 10000,
      });
      if (stopping) return;
      await Passenger.init();
      await Driver.init();
      await EmailOtp.init();
      await Pool.init();
      await RideRequest.init();
      await seedDemoAccounts();
      databaseInitialized = true;
      app.locals.databaseReady = true;
      console.log("Connected to MongoDB Atlas");
    } catch (error) {
      app.locals.databaseReady = false;
      databaseInitialized = false;
      const serverErrors = [...(error.reason?.servers?.values() || [])]
        .map((server) => server.error?.cause?.code || server.error?.code)
        .filter(Boolean);
      const reason = [...new Set(serverErrors)].join(", ") || error.codeName || error.name;
      console.error(`MongoDB connection failed (${reason}). Retrying in ${retryDelayMs / 1000} seconds.`);
      await mongoose.disconnect().catch(() => {});
      if (!stopping) retryTimer = setTimeout(connectDatabase, retryDelayMs);
    }
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`App available at http://localhost:${port}`);
  });
  void connectDatabase();

  async function shutdown() {
    stopping = true;
    clearTimeout(retryTimer);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error(`App startup failed: ${error.message}`);
  process.exit(1);
});
