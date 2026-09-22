import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import passengerRoutes from "./routes/passengerRoutes.js";
import Passenger from "./models/Passenger.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET;
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  const connected = mongoose.connection.readyState === 1;
  response.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api/passengers", passengerRoutes);

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "API route not found." });
});

app.use(express.static(publicDirectory));
app.use((request, response) => {
  if (request.method !== "GET") {
    return response.status(404).json({ message: "Route not found." });
  }
  response.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ message: "Invalid JSON request." });
  }
  console.error("Request failed:", error);
  response.status(500).json({ message: "Something went wrong. Please try again." });
});

async function start() {
  if (!mongoUri || mongoUri.includes("USERNAME:PASSWORD@CLUSTER_HOST")) {
    throw new Error("Set your MongoDB Atlas MONGODB_URI in backend/.env.");
  }
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32 || jwtSecret.startsWith("replace_this")) {
    throw new Error("Set a unique JWT_SECRET of at least 32 bytes in backend/.env.");
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB_NAME || "dhaka_tesla_pool",
    serverSelectionTimeoutMS: 10000,
  });
  await Passenger.init();
  console.log("Connected to MongoDB");

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`App listening on port ${port}`);
  });

  async function shutdown() {
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
