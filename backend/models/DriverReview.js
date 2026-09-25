import mongoose from "mongoose";

const driverReviewSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "RideRequest", required: true, unique: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: "Passenger", required: true, index: true },
  passengerName: { type: String, required: true, trim: true, maxlength: 80 },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  comment: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
}, { timestamps: true });

driverReviewSchema.index({ driver: 1, createdAt: -1 });

export default mongoose.model("DriverReview", driverReviewSchema);
