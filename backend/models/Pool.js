import mongoose from "mongoose";

const poolSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
  pickupArea: { type: String, required: true },
  firstDestinationArea: { type: String, required: true },
  vehicleName: { type: String, required: true },
  vehicleRegistrationNumber: { type: String, required: true },
  vehicleColor: { type: String, default: null },
  driverName: { type: String, default: null },
  driverAreaAtMatch: { type: String, default: null },
  capacity: { type: Number, required: true, min: 2, max: 4 },
  occupiedSeats: { type: Number, required: true, min: 0 },
  members: [{ request: { type: mongoose.Schema.Types.ObjectId, ref: "RideRequest", required: true }, passenger: { type: mongoose.Schema.Types.ObjectId, ref: "Passenger", required: true }, passengerName: String, seats: { type: Number, required: true }, destinationArea: String }],
  status: { type: String, enum: ["MATCHED", "DRIVER_ARRIVED", "STARTED", "COMPLETED", "CANCELLED"], default: "MATCHED" },
  history: [{ status: String, at: Date, request: mongoose.Schema.Types.ObjectId, passengerName: String, seats: Number }],
}, { timestamps: true });

poolSchema.index({ driver: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["MATCHED", "DRIVER_ARRIVED", "STARTED"] } } });

export default mongoose.model("Pool", poolSchema);
