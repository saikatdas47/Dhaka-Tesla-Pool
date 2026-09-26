import mongoose from "mongoose";

const fareSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "current" },
    baseFarePaisa: { type: Number, required: true, min: 0 },
    perKmPaisa: { type: Number, required: true, min: 0 },
    sharedDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
    discountBpsPerKm2: {
      type: Number,
      default: 150,
      min: 0,
      max: 10000,
      validate: Number.isInteger,
    },
    discountBpsPerKm3: {
      type: Number,
      default: 200,
      min: 0,
      max: 10000,
      validate: Number.isInteger,
    },
    discountBpsPerKm4: {
      type: Number,
      default: 250,
      min: 0,
      max: 10000,
      validate: Number.isInteger,
    },
    maxDiscountBps: {
      type: Number,
      default: 3000,
      min: 0,
      max: 10000,
      validate: Number.isInteger,
    },
  },
  { timestamps: true },
);

export default mongoose.model("FareSettings", fareSettingsSchema);
