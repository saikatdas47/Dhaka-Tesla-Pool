import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderRole: { type: String, required: true, enum: ["passenger", "driver"] },
  sender: { type: mongoose.Schema.Types.ObjectId, required: true },
  text: { type: String, required: true, maxlength: 500 },
  sentAt: { type: Date, required: true },
}, { _id: true });

const rideChatSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "RideRequest", required: true, unique: true },
  pool: { type: mongoose.Schema.Types.ObjectId, ref: "Pool", required: true, index: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: "Passenger", required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
  status: { type: String, enum: ["open", "closed"], default: "open" },
  closedAt: { type: Date, default: null },
  messages: { type: [messageSchema], default: [] },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Chats are removed at pickup arrival or cancellation. TTL is only a safety
// net for abandoned rides that never reach either transition.
rideChatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RideChat", rideChatSchema);
