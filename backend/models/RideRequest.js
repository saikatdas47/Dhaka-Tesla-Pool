import mongoose from "mongoose";

const rideRequestSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Passenger",
      required: true,
    },
    passengerName: { type: String, default: null },
    pickupArea: { type: String, required: true },
    destinationArea: { type: String, required: true },
    seats: { type: Number, required: true, min: 1, max: 4 },
    approximateKm: { type: Number, required: true },
    soloFarePaisa: { type: Number, required: true, min: 0 },
    pooledFarePaisa: { type: Number, required: true, min: 0 },
    fareRule: {
      baseFarePaisa: Number,
      perKmPaisa: Number,
      sharedDiscountPercent: Number,
    },
    finalFarePaisa: { type: Number, default: null },
    paymentMethod: { type: String, enum: ["cash", "teslapay"], default: null },
    paymentStatus: {
      type: String,
      enum: ["pending", "due", "paid", "cancelled"],
      default: null,
    },
    paidAt: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "MATCHED",
        "DRIVER_ARRIVED",
        "STARTED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },
    pool: { type: mongoose.Schema.Types.ObjectId, ref: "Pool", default: null },
    history: [{ status: String, at: Date }],
  },
  { timestamps: true },
);

rideRequestSchema.index({ pickupArea: 1, status: 1, createdAt: 1 });
rideRequestSchema.index(
  { passenger: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"] },
    },
  },
);

export default mongoose.model("RideRequest", rideRequestSchema);
