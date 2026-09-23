import mongoose from "mongoose";

const fareSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: "current" },
  baseFarePaisa: { type: Number, required: true, min: 0 },
  perKmPaisa: { type: Number, required: true, min: 0 },
  sharedDiscountPercent: { type: Number, required: true, min: 0, max: 100 },
}, { timestamps: true });

export default mongoose.model("FareSettings", fareSettingsSchema);
