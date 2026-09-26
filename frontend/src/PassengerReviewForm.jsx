import { useState } from "react";
import { roleFetch } from "./tabAuth.js";

export default function PassengerReviewForm({ rideId, existing, onSaved }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (existing)
    return (
      <div className="my-review">
        <strong>
          Your review · {"★".repeat(existing.rating)}
          {"☆".repeat(5 - existing.rating)}
        </strong>
        <p>{existing.comment}</p>
      </div>
    );
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await roleFetch(
        "passenger",
        `/api/rides/requests/${rideId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, comment: comment.trim() }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.message || "Review could not be saved.");
      onSaved(body.data.review);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="passenger-review-form" onSubmit={submit}>
      <div className="passenger-review-head">
        <h3>Review your driver</h3>
        <label className="field review-rating">
          Rating
          <select
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {"★".repeat(value)} {value}/5
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field review-comment">
        Your comment
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          minLength={1}
          maxLength={1000}
          required
          placeholder="Tell us about your trip with this driver…"
        />
      </label>
      <div className="passenger-review-actions">
        <span>{comment.length}/1000</span>
        <button
          className="retry-button"
          type="submit"
          disabled={busy || !comment.trim()}
        >
          {busy ? "Saving…" : "Post review"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
