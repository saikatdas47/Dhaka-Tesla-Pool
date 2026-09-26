import mongoose from "mongoose";

// Working ledger only. Permanent Passenger breakdowns live on RideRequest.
const schema = new mongoose.Schema(
  {
    pool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pool",
      unique: true,
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    settledThrough: { type: Number, default: 0 },
    segments: [
      {
        index: Number,
        occupiedSeats: Number,
        charges: [{ ride: String, paisa: Number }],
      },
    ],
  },
  { timestamps: true },
);
export default mongoose.model("LiveFare", schema);
