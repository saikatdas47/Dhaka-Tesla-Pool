import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import passengerRoutes from "./routes/passengerRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import emailOtpRoutes from "./routes/emailOtpRoutes.js";
import { publicDemoAccounts } from "./config/demoAccounts.js";
import { ApiError } from "./utils/apiError.js";
import { ApiResponse } from "./utils/apiResponse.js";

const app = express();
const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
app.locals.databaseReady = false;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  const connected = mongoose.connection.readyState === 1 && app.locals.databaseReady;
  response.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api", (request, response, next) => {
  const needsDatabase = /^\/(passengers|drivers|email-otp)(\/|$)/.test(request.path);
  if (needsDatabase && !app.locals.databaseReady) {
    return response.status(503).json(new ApiResponse(503, null, "Database is temporarily unavailable. Please try again shortly."));
  }
  next();
});

app.use("/api/passengers", passengerRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/email-otp", emailOtpRoutes);
app.get("/api/demo-accounts", (_request, response) => {
  response.set("Cache-Control", "no-store");
  const accounts = publicDemoAccounts();
  if (!accounts) return response.status(404).json(new ApiResponse(404, null, "Demo accounts are disabled."));
  response.json(new ApiResponse(200, accounts, "Local demo accounts."));
});
app.use("/api", (_request, response) => {
  response.status(404).json(new ApiResponse(404, null, "API route not found."));
});

app.use(express.static(publicDirectory));
app.use((request, response) => {
  if (request.method !== "GET") {
    return response.status(404).json({ message: "Route not found." });
  }
  response.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return response.status(status).json(new ApiResponse(status, null, error.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : "Upload only one image using the avatar field."));
  }
  if (error instanceof ApiError) {
    return response.status(error.statusCode).json(new ApiResponse(error.statusCode, null, error.message));
  }
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json(new ApiResponse(400, null, "Invalid JSON request."));
  }
  console.error("Request failed:", error);
  response.status(500).json(new ApiResponse(500, null, "Something went wrong. Please try again."));
});

export default app;
