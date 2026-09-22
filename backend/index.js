import "dotenv/config";
import express from "express";
import mongoose from "mongoose";

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI;

app.use(express.json());

app.get("/health", (_request, response) => {
  const connected = mongoose.connection.readyState === 1;
  response.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

async function start() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Set it in backend/.env.");
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB Atlas");

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on port ${port}`);
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
  console.error(`API startup failed: ${error.message}`);
  process.exit(1);
});
