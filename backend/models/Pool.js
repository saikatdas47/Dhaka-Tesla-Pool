import mongoose from "mongoose";

const poolSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    pickupArea: { type: String, required: true },
    routeCode: String,
    routeName: String,
    direction: { type: String, enum: ["forward", "reverse"] },
    routeStops: [String],
    segmentKm: [Number],
    segmentSeats: [{ type: Number, min: 0, validate: Number.isInteger }],
    endIndex: Number,
    currentStopIndex: { type: Number, default: 0 },
    firstDestinationArea: { type: String, required: true },
    vehicleName: { type: String, required: true },
    vehicleRegistrationNumber: { type: String, required: true },
    vehicleColor: { type: String, default: null },
    driverName: { type: String, default: null },
    driverAreaAtMatch: { type: String, default: null },
    capacity: {
      type: Number,
      required: true,
      min: 2,
      max: 4,
      validate: Number.isInteger,
    },
    occupiedSeats: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    members: [
      {
        request: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RideRequest",
          required: true,
        },
        passenger: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Passenger",
          required: true,
        },
        passengerName: String,
        seats: { type: Number, required: true },
        pickupArea: String,
        pickupIndex: Number,
        destinationIndex: Number,
        status: { type: String, default: "MATCHED" },
        destinationArea: String,
      },
    ],
    status: {
      type: String,
      enum: ["MATCHED", "DRIVER_ARRIVED", "STARTED", "COMPLETED", "CANCELLED"],
      default: "MATCHED",
    },
    history: [
      {
        status: String,
        at: Date,
        request: mongoose.Schema.Types.ObjectId,
        passengerName: String,
        seats: Number,
      },
    ],
  },
  { timestamps: true },
);

poolSchema.index(
  { driver: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["MATCHED", "DRIVER_ARRIVED", "STARTED"] },
    },
  },
);

poolSchema.pre("validate", function () {
  if (!this.routeCode) return; // Old completed records remain readable.
  if (this.occupiedSeats > this.capacity)
    this.invalidate("occupiedSeats", "Onboard seats exceed capacity.");
  if (this.segmentSeats.length !== this.routeStops.length - 1)
    this.invalidate(
      "segmentSeats",
      "One reservation count is required per route segment.",
    );
  for (const count of this.segmentSeats) {
    if (count > this.capacity)
      this.invalidate("segmentSeats", "A segment exceeds capacity.");
  }
});

export default mongoose.model("Pool", poolSchema);
