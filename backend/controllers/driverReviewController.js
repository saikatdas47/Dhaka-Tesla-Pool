import mongoose from "mongoose";
import Driver from "../models/Driver.js";
import DriverReview from "../models/DriverReview.js";
import RideRequest from "../models/RideRequest.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

function publicReview(review) {
  return { id: review.id, rideId: String(review.ride), passengerName: review.passengerName || review.passenger?.name || "Passenger", driverId: String(review.driver), rating: review.rating, comment: review.comment, createdAt: review.createdAt };
}

async function reviewsForDriver(driverId, page = 1) {
  const [reviews, total, average] = await Promise.all([
    DriverReview.find({ driver: driverId }).sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).populate("passenger", "name"),
    DriverReview.countDocuments({ driver: driverId }),
    DriverReview.aggregate([{ $match: { driver: new mongoose.Types.ObjectId(driverId) } }, { $group: { _id: null, rating: { $avg: "$rating" } } }]),
  ]);
  return { reviews: reviews.map(publicReview), total, page, pages: Math.ceil(total / 20), averageRating: average[0]?.rating ?? null };
}

export const submitDriverReview = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid ride ID.");
  const rating = request.body?.rating;
  const comment = typeof request.body?.comment === "string" ? request.body.comment.trim() : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(400, "Choose 1 to 5 stars.");
  if (!comment || comment.length > 1000) throw new ApiError(400, "Comment must be 1–1000 characters.");
  const ride = await RideRequest.findOne({ _id: request.params.id, passenger: request.passenger.id, status: "COMPLETED" }).populate("pool", "driver");
  if (!ride?.pool?.driver) throw new ApiError(403, "Only a Passenger who completed this driver's trip can review it.");
  try {
    const review = await DriverReview.create({ ride: ride.id, passenger: request.passenger.id, passengerName: ride.passengerName || request.passenger.name, driver: ride.pool.driver, rating, comment });
    response.status(201).json(new ApiResponse(201, { review: publicReview(review) }, "Driver review saved."));
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, "You already reviewed this ride.");
    throw error;
  }
});

export const myDriverReviews = asyncHandler(async (request, response) => {
  const reviews = await DriverReview.find({ passenger: request.passenger.id }).select("ride passenger passengerName driver rating comment createdAt").populate("passenger", "name");
  response.json(new ApiResponse(200, { reviews: reviews.map(publicReview) }, "Your driver reviews."));
});

export const ownDriverReviews = asyncHandler(async (request, response) => {
  const page = Math.max(1, Math.min(1000, Number.parseInt(request.query.page, 10) || 1));
  response.json(new ApiResponse(200, await reviewsForDriver(request.driver.id, page), "Driver reviews."));
});

export const adminDriverReviews = asyncHandler(async (request, response) => {
  if (!mongoose.isValidObjectId(request.params.id)) throw new ApiError(400, "Invalid driver ID.");
  if (!await Driver.exists({ _id: request.params.id })) throw new ApiError(404, "Driver not found.");
  const page = Math.max(1, Math.min(1000, Number.parseInt(request.query.page, 10) || 1));
  response.json(new ApiResponse(200, await reviewsForDriver(request.params.id, page), "Driver reviews."));
});
