import { useEffect, useState } from "react";
import { roleFetch } from "./tabAuth.js";

export default function DriverReviews({ endpoint }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { setPage(1); }, [endpoint]);
  useEffect(() => {
    let active = true;
    setError("");
    (endpoint.startsWith("/api/admin/") ? fetch(`${endpoint}?page=${page}`, { credentials: "same-origin" }) : roleFetch("driver", `${endpoint}?page=${page}`)).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Reviews could not load.");
      return body.data;
    }).then((value) => { if (active) setData(value); }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [endpoint, page]);
  return <section className="info-card driver-reviews"><div className="driver-reviews-head"><div><span className="card-kicker">PASSENGER FEEDBACK</span><h2>Driver reviews</h2></div>{data && <span className="driver-reviews-summary">{data.averageRating == null ? "No rating yet" : `★ ${data.averageRating.toFixed(1)} / 5`} · {data.total} review{data.total === 1 ? "" : "s"}</span>}</div>{error && <p className="form-error" role="alert">{error}</p>}{!data && !error && <p>Loading reviews…</p>}{data?.reviews.length === 0 && <p>No reviews yet.</p>}{data?.reviews.map((review) => <article className="driver-review" key={review.id}><div className="driver-review-meta"><strong>{review.passengerName}</strong><span aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><time>{new Date(review.createdAt).toLocaleDateString()}</time></div><p>{review.comment}</p></article>)}{data?.pages > 1 && <div className="history-pagination"><button className="retry-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {data.pages}</span><button className="retry-button" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}</section>;
}
