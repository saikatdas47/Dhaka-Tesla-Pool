import { useEffect, useState } from "react";
import RideChatBox from "./RideChatBox.jsx";
import PassengerReviewForm from "./PassengerReviewForm.jsx";
import { roleFetch } from "./tabAuth.js";
import { watchRideUpdates } from "./rideUpdates.js";

async function request(role, path, options = {}) {
  const response = await roleFetch(role, `/api/rides${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Ride request failed.");
  return body.data;
}

function taka(paisa) {
  return `৳${(paisa / 100).toFixed(2)}`;
}
function paymentLabel(method) {
  return method === "teslapay"
    ? "TeslaPay (simulated)"
    : method === "cash"
      ? "Cash"
      : "Not recorded";
}

async function updateDriverAvailability(body) {
  const response = await roleFetch("driver", "/api/drivers/availability", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(result.message || "Could not update availability.");
  return result.data.driver;
}

function AreaMap({
  areas,
  edges = [],
  path = [],
  extensionStops = [],
  drivers = [],
  selectedArea,
  destinationArea,
  assignedArea,
  assignedOnline = true,
}) {
  const positions = {
    Dhanmondi: [120, 390],
    Farmgate: [285, 330],
    Mohakhali: [425, 260],
    "Gulshan 1": [585, 215],
    Banani: [500, 150],
    Bashundhara: [690, 80],
    Mirpur: [70, 170],
    Agargaon: [190, 230],
    Uttara: [370, 55],
    Motijheel: [700, 400],
    Shahbag: [510, 355],
  };
  function onPath(from, to) {
    for (let index = 0; index < path.length - 1; index++) {
      if (
        (path[index] === from && path[index + 1] === to) ||
        (path[index] === to && path[index + 1] === from)
      )
        return true;
    }
    return false;
  }
  return (
    <div className="area-map">
      <div className="area-map-title">
        <strong>Dhaka weighted graph</strong>
        <small className="map-subtitle">
          <span>Demo distances · BFS tree path · no live GPS</span>
          <span
            className="map-direction"
            aria-label="Travel from yellow pickup to purple destination"
          >
            <span className="map-dot pickup-dot" aria-hidden="true" />
            Pickup <span aria-hidden="true">→</span>
            <span className="map-dot destination-dot" aria-hidden="true" />
            Destination
          </span>
        </small>
      </div>
      <svg
        viewBox="0 0 800 450"
        role="img"
        aria-label="Dhaka graph, edge distances and shortest path"
      >
        {edges.map((edge) => {
          const [x1, y1] = positions[edge.from],
            [x2, y2] = positions[edge.to];
          let color = "#ccd6dc";
          if (onPath(edge.from, edge.to)) color = "#3776bd";
          if (
            onPath(edge.from, edge.to) &&
            (extensionStops.includes(edge.from) ||
              extensionStops.includes(edge.to))
          )
            color = "#ec8c32";
          const x = (x1 + x2) / 2,
            y = (y1 + y2) / 2;
          return (
            <g key={edge.from + edge.to}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={onPath(edge.from, edge.to) ? 6 : 3}
              />
              <rect
                x={x - 18}
                y={y - 9}
                width="36"
                height="18"
                rx="5"
                fill="white"
              />
              <text
                x={x}
                y={y + 4}
                fontSize="11"
                textAnchor="middle"
                fill="#455569"
              >
                {edge.km} km
              </text>
            </g>
          );
        })}
        {Object.keys(areas).map((name) => {
          const [x, y] = positions[name];
          let fill = "#93a5b2";
          if (drivers.some((driver) => driver.area === name)) fill = "#218452";
          if (name === selectedArea) fill = "#eab308";
          if (name === destinationArea) fill = "#8b5cf6";
          const left = x > 590;
          return (
            <g key={name}>
              <circle
                cx={x}
                cy={y}
                r={name === selectedArea || name === destinationArea ? 11 : 7}
                fill={fill}
                stroke="white"
                strokeWidth="3"
              />
              {name === assignedArea && (
                <circle
                  cx={x}
                  cy={y}
                  r="17"
                  fill="none"
                  stroke={assignedOnline ? "#218452" : "#9ca3af"}
                  strokeWidth="3"
                />
              )}
              <text
                x={left ? x - 15 : x + 15}
                y={y - 12}
                textAnchor={left ? "end" : "start"}
                fontSize="13"
                fill="#27394b"
                fontWeight="700"
              >
                {name}
              </text>
              {name === selectedArea && (
                <text
                  x={x}
                  y={y + 25}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#806300"
                >
                  Pickup / current area
                </text>
              )}
              {name === destinationArea && (
                <text
                  x={x}
                  y={y + 25}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#6940ab"
                >
                  Destination
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p>
        Yellow: pickup · Purple: destination · Blue: path · Orange: proposed
        extension · Driver ring: green online / grey offline.
      </p>
    </div>
  );
}

export function PassengerRides() {
  const [areas, setAreas] = useState(null);
  const [edges, setEdges] = useState([]);
  const [path, setPath] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [rides, setRides] = useState([]);
  const [pickupArea, setPickupArea] = useState("Banani");
  const [destinationArea, setDestinationArea] = useState("Mohakhali");
  const [seats, setSeats] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [mine, nearby] = await Promise.all([
      request("passenger", "/mine?view=active"),
      request("passenger", "/nearby-drivers"),
    ]);
    setRides(mine.rides);
    setDrivers(nearby.drivers);
  }
  useEffect(() => {
    request("passenger", "/config")
      .then((result) => {
        setAreas(result.areas);
        setEdges(result.edges);
      })
      .catch((failure) => setError(failure.message));
    refresh().catch((failure) => setError(failure.message));
    return watchRideUpdates("passenger", refresh);
  }, []);
  useEffect(() => {
    setQuote(null);
  }, [pickupArea, destinationArea, seats]);

  useEffect(() => {
    let current = true;
    setPath([]);
    const params = new URLSearchParams({
      pickup: pickupArea,
      destination: destinationArea,
    });
    request("passenger", "/path?" + params)
      .then((result) => {
        if (current) setPath(result.routeStops);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [pickupArea, destinationArea]);

  async function estimate() {
    setError("");
    try {
      setQuote(
        await request("passenger", "/quote", {
          method: "POST",
          body: JSON.stringify({
            pickupArea,
            destinationArea,
            seats: Number(seats),
          }),
        }),
      );
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("passenger", "/requests", {
        method: "POST",
        body: JSON.stringify({
          pickupArea,
          destinationArea,
          seats: Number(seats),
          paymentMethod,
        }),
      });
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id) {
    setBusy(true);
    setError("");
    try {
      await request("passenger", `/requests/${id}/cancel`, { method: "PATCH" });
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const active = rides.find(
    (ride) => !["COMPLETED", "CANCELLED"].includes(ride.status),
  );
  const areaNames = Object.keys(areas || {});
  return (
    <section className="ride-section">
      <div className="ride-section-head">
        <span className="card-kicker">YOUR JOURNEY</span>
        <h2>Request a shared ride</h2>
        <p>
          Choose Dhaka areas. The unique tree path is calculated automatically
          for any listed pair.
        </p>
      </div>
      <div className="driver-map-layout passenger-map-layout">
        {areas && (
          <AreaMap
            areas={areas}
            edges={edges}
            path={active?.routeStops || path}
            destinationArea={active?.destinationArea || destinationArea}
            drivers={drivers}
            selectedArea={active?.pickupArea || pickupArea}
            assignedArea={active?.driverArea}
            assignedOnline={active?.driverAvailability === "online"}
          />
        )}
        <form className="info-card ride-form" onSubmit={create}>
          <h3>New ride</h3>
          <label className="field">
            Pickup
            <select
              value={pickupArea}
              onChange={(event) => setPickupArea(event.target.value)}
            >
              {areaNames.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Destination
            <select
              value={destinationArea}
              onChange={(event) => setDestinationArea(event.target.value)}
            >
              {areaNames.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Seats
            <select
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Payment
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="teslapay">TeslaPay (simulated)</option>
            </select>
          </label>
          <button type="button" className="retry-button" onClick={estimate}>
            Estimate fare
          </button>
          {quote && (
            <p className="fare-estimate">
              Estimated fare: {taka(quote.soloFarePaisa)}
              <small>
                ~{quote.approximateKm} km · savings update after shared travel.
              </small>
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={busy || Boolean(active) || !areas}
          >
            {active
              ? "Finish your current ride first"
              : busy
                ? "Sending…"
                : "Request ride"}
          </button>
        </form>
      </div>
      <div className="info-card">
        <h3>Current ride</h3>
        {rides.length === 0 ? (
          <p>No active ride. Create your first request.</p>
        ) : (
          <div className="ride-list">
            {rides.map((ride) => (
              <article className="ride-item" key={ride.id}>
                <strong>
                  {ride.pickupArea} → {ride.destinationArea}
                </strong>
                <span className="status-pill">
                  {ride.status.replaceAll("_", " ")}
                </span>
                <p>
                  {ride.seats} seat{ride.seats > 1 ? "s" : ""}
                  {ride.poolSize > 1
                    ? ` · ${ride.poolSize} passengers sharing`
                    : ""}
                </p>
                <div className="fare-estimate" aria-live="polite">
                  <small>
                    {ride.status === "COMPLETED"
                      ? "Final fare"
                      : "Estimated fare"}
                  </small>
                  <div className="fare-price-steps">
                    {(ride.fareStepsPaisa?.length > 1
                      ? ride.fareStepsPaisa.slice(0, -1)
                      : ride.currentFarePaisa !== ride.soloFarePaisa
                        ? [ride.soloFarePaisa]
                        : []
                    ).map((amount, index) => (
                      <span key={index}>
                        <del>{taka(amount)}</del>
                        <span aria-hidden="true"> → </span>
                      </span>
                    ))}
                    <strong>{taka(ride.currentFarePaisa)}</strong>
                  </div>
                  {ride.currentFarePaisa < ride.soloFarePaisa && (
                    <small>
                      Saved {taka(ride.soloFarePaisa - ride.currentFarePaisa)}{" "}
                      through sharing
                    </small>
                  )}
                  {ride.status === "STARTED" && (
                    <small>
                      Includes expected sharing with passengers already onboard;
                      final fare uses actual shared distance.
                    </small>
                  )}
                </div>
                <p>
                  Payment: {paymentLabel(ride.paymentMethod)} ·{" "}
                  {ride.paymentStatus}
                </p>
                {ride.driverName && (
                  <p>
                    Driver: {ride.driverName}
                    {ride.driverArea
                      ? ` · last recorded area: ${ride.driverArea}`
                      : ""}
                  </p>
                )}
                {["REQUESTED", "MATCHED", "DRIVER_ARRIVED"].includes(
                  ride.status,
                ) && (
                  <button
                    type="button"
                    className="retry-button"
                    disabled={busy}
                    onClick={() => cancel(ride.id)}
                  >
                    Cancel ride
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      {active?.status === "MATCHED" && (
        <RideChatBox
          role="passenger"
          rideId={active.id}
          title="Message your driver"
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function DriverRides({ driver, onDriverUpdated }) {
  const [areas, setAreas] = useState(null);
  const [edges, setEdges] = useState([]);
  const [currentArea, setCurrentArea] = useState(
    driver.currentArea || "Banani",
  );
  const [preview, setPreview] = useState(null);
  const [offers, setOffers] = useState([]);
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const [available, current, accountResponse] = await Promise.all([
      request("driver", "/offers"),
      request("driver", "/driver/current"),
      roleFetch("driver", "/api/drivers/me"),
    ]);
    setOffers(available.offers);
    setPool(current.pool);
    if (accountResponse.ok)
      onDriverUpdated((await accountResponse.json()).data.driver);
  }
  useEffect(() => {
    request("driver", "/config")
      .then((result) => {
        setAreas(result.areas);
        setEdges(result.edges);
      })
      .catch((failure) => setError(failure.message));
    refresh().catch((failure) => setError(failure.message));
    return watchRideUpdates("driver", refresh);
  }, []);
  useEffect(() => {
    setCurrentArea(driver.currentArea || "Banani");
  }, [driver.currentArea]);
  async function action(path, method, body) {
    setBusy(true);
    setError("");
    try {
      await request("driver", path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setPreview(null);
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveAvailability(availability) {
    setBusy(true);
    setError("");
    try {
      onDriverUpdated(
        await updateDriverAvailability({
          availability,
          ...(pool ? {} : { currentArea }),
        }),
      );
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const chats =
    pool?.members.filter((member) => member.status === "MATCHED") || [];
  const transitions = {
    MATCHED: ["DRIVER_ARRIVED", "Mark arrived"],
    DRIVER_ARRIVED: ["STARTED", "Pick up passenger"],
    STARTED: ["COMPLETED", "Drop off passenger"],
  };
  return (
    <section className="ride-section">
      <div className="ride-section-head">
        <span className="card-kicker">DRIVER WORKSPACE</span>
        <h2>Your route, passengers and seats</h2>
        <p>
          First booking starts at your area. Later bookings follow the path or
          extend it forward.
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="driver-map-layout">
        {areas && (
          <AreaMap
            areas={areas}
            edges={edges}
            path={preview?.proposedPath || pool?.routeStops || []}
            extensionStops={preview?.extensionStops || []}
            selectedArea={driver.currentArea}
            destinationArea={
              preview?.proposedPath?.at(-1) || pool?.routeStops?.at(-1)
            }
            assignedArea={driver.currentArea}
            assignedOnline={driver.availability === "online"}
          />
        )}
        <div className="info-card availability-card">
          <h3>Your availability</h3>
          <p
            className={
              "status-pill availability-pill " +
              (driver.availability === "online" ? "online" : "offline")
            }
          >
            {driver.availability || "offline"}
          </p>
          {pool ? (
            <p>
              Current area: <strong>{driver.currentArea}</strong>
              <br />
              Updated by pickup/drop-off actions. No manual trip-location
              controls.
            </p>
          ) : (
            <label className="field">
              Starting area
              <select
                value={currentArea}
                onChange={(event) => setCurrentArea(event.target.value)}
              >
                {Object.keys(areas || {}).map((area) => (
                  <option key={area}>{area}</option>
                ))}
              </select>
            </label>
          )}
          {pool && (
            <p>
              Automatic destination: <strong>{pool.routeStops?.at(-1)}</strong>
            </p>
          )}
          <div className="profile-actions">
            <button
              className="retry-button"
              disabled={
                busy || (driver.verificationStatus !== "approved" && !pool)
              }
              onClick={() => saveAvailability("online")}
            >
              {pool ? "Resume online" : "Save starting area & go online"}
            </button>
            <button
              className="retry-button"
              disabled={
                busy || Boolean(pool) || driver.availability !== "online"
              }
              onClick={() => saveAvailability("offline")}
            >
              Go offline
            </button>
          </div>
          {pool && (
            <p className="availability-note">
              Finish all accepted bookings before going offline. Pickup/drop-off
              updates your area automatically.
            </p>
          )}
          {driver.verificationStatus !== "approved" && (
            <p>Approval is required to receive new offers.</p>
          )}
        </div>
      </div>
      <div className="info-card ride-offers-card">
        <h3>Compatible ride requests</h3>
        {offers.length === 0 ? (
          <p>
            No compatible requests. Check your starting area and available
            segment seats.
          </p>
        ) : (
          <div className="offer-grid">
            {offers.map((offer) => (
              <article className="ride-item" key={offer.id}>
                <strong>
                  {offer.pickupArea} → {offer.destinationArea}
                </strong>
                <p>
                  {offer.seats} seat(s) · solo estimate{" "}
                  {taka(offer.soloFarePaisa)}
                </p>
                <p>
                  {offer.compatibility}
                  {offer.addedKm > 0 ? " · Adds " + offer.addedKm + " km" : ""}
                </p>
                <div className="offer-actions">
                  <button
                    className="retry-button"
                    onClick={() => setPreview(offer)}
                  >
                    Preview path
                  </button>
                  <button
                    className="retry-button"
                    disabled={busy}
                    onClick={() =>
                      action("/requests/" + offer.id + "/accept", "POST")
                    }
                  >
                    Accept booking
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {chats.length > 0 && (
        <section>
          <h3>Passenger chats</h3>
          <div className="driver-chat-grid">
            {chats.map((member) => (
              <RideChatBox
                key={member.requestId}
                role="driver"
                rideId={member.requestId}
                title={"Message " + (member.passengerName || "Passenger")}
              />
            ))}
          </div>
        </section>
      )}
      <div className="info-card">
        <h3>Current pool</h3>
        {!pool ? (
          <p>No active pool. Accept a request to start.</p>
        ) : (
          <>
            <p>
              {pool.vehicleName} · {pool.occupiedSeats}/{pool.capacity} seats
              currently on board
            </p>
            {pool.routeStops?.length > 0 && (
              <p>{pool.routeStops.slice(0, pool.endIndex + 1).join(" → ")}</p>
            )}
            {pool.segmentSeats?.length > 0 && (
              <div className="segment-summary">
                {pool.segmentSeats
                  .slice(0, pool.endIndex)
                  .map((count, index) => (
                    <span key={index}>
                      {pool.routeStops[index]} → {pool.routeStops[index + 1]}:{" "}
                      <strong>
                        {count}/{pool.capacity}
                      </strong>
                    </span>
                  ))}
              </div>
            )}
            <div className="offer-grid">
              {pool.members.map((member) => {
                const next = transitions[member.status];
                return (
                  <article className="ride-item" key={member.requestId}>
                    <strong>{member.passengerName || "Passenger"}</strong>
                    <p>
                      {member.pickupArea} → {member.destinationArea} ·{" "}
                      {member.seats} seat(s)
                    </p>
                    <span className="status-pill">
                      {member.status?.replaceAll("_", " ")}
                    </span>
                    {pool.routeCode && next && (
                      <button
                        className="retry-button"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "/requests/" + member.requestId + "/status",
                            "PATCH",
                            { status: next[0] },
                          )
                        }
                      >
                        {next[1]}
                      </button>
                    )}
                    {member.paymentStatus === "due" &&
                      member.paymentMethod === "cash" && (
                        <button
                          className="retry-button"
                          disabled={busy}
                          onClick={() =>
                            action(
                              "/requests/" + member.requestId + "/confirm-cash",
                              "POST",
                            )
                          }
                        >
                          Confirm cash received
                        </button>
                      )}
                  </article>
                );
              })}
            </div>
            {!pool.routeCode && transitions[pool.status] && (
              <button
                className="retry-button"
                disabled={busy}
                onClick={() =>
                  action("/pools/" + pool.id + "/status", "PATCH", {
                    status: transitions[pool.status][0],
                  })
                }
              >
                Legacy trip: {transitions[pool.status][1]}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Timeline({ events }) {
  return (
    <ol className="ride-timeline">
      {(events || []).map((event, index) => (
        <li key={`${event.status}-${index}`}>
          <strong>{event.status.replaceAll("_", " ")}</strong>
          <time>{event.at ? new Date(event.at).toLocaleString() : ""}</time>
        </li>
      ))}
    </ol>
  );
}

export function RideHistory({ role }) {
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [payingId, setPayingId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const path =
      role === "driver"
        ? `/driver/history?page=${page}`
        : `/mine?view=history&page=${page}`;
    request(role, path)
      .then((result) => {
        if (active) {
          setItems(role === "driver" ? result.pools : result.rides);
          setPages(result.pages);
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [role, page, reload]);
  useEffect(() => {
    if (role !== "passenger") return;
    let active = true;
    request("passenger", "/reviews/mine")
      .then(({ reviews: list }) => {
        if (active)
          setReviews(
            Object.fromEntries(list.map((review) => [review.rideId, review])),
          );
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [role, reload]);
  async function confirmCash(requestId) {
    setPayingId(requestId);
    setError("");
    try {
      await request("driver", `/requests/${requestId}/confirm-cash`, {
        method: "POST",
      });
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPayingId("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">PAST JOURNEYS</span>
        <h1>History</h1>
        <p>
          {role === "driver"
            ? "Your completed and cancelled pools."
            : "Only your own completed and cancelled rides appear here."}
        </p>
      </div>
      {loading && <p>Loading history…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <section className="info-card">
          <h2>No past trips yet</h2>
          <p>Completed and cancelled trips will appear here.</p>
        </section>
      )}
      <div className="history-list">
        {items.map((item) => (
          <details className="info-card history-card" key={item.id}>
            <summary>
              <span>
                <strong>
                  {role === "driver"
                    ? `${item.pickupArea} · ${item.vehicleName}`
                    : `${item.pickupArea} → ${item.destinationArea}`}
                </strong>
                <small>
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleString()
                    : ""}
                </small>
              </span>
              <span className="status-pill">
                {item.status.replaceAll("_", " ")}
              </span>
            </summary>
            {role === "driver" ? (
              <>
                <p>
                  {item.members.length} passenger(s) · {item.occupiedSeats}/
                  {item.capacity} seats · {item.vehicleRegistrationNumber}
                </p>
                <ul className="pool-members">
                  {item.members.map((member) => (
                    <li key={member.requestId}>
                      {member.passengerName || "Passenger"} · {member.seats}{" "}
                      seat(s) → {member.destinationArea} ·{" "}
                      {member.farePaisa == null
                        ? "No final fare"
                        : taka(member.farePaisa)}{" "}
                      · {paymentLabel(member.paymentMethod)} (
                      {member.paymentStatus})
                      {member.paymentMethod === "cash" &&
                        member.paymentStatus === "due" && (
                          <button
                            type="button"
                            className="retry-button"
                            disabled={Boolean(payingId)}
                            onClick={() => confirmCash(member.requestId)}
                          >
                            {payingId === member.requestId
                              ? "Confirming…"
                              : "Confirm cash received"}
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
                <Timeline events={item.history} />
              </>
            ) : (
              <>
                <p>
                  {item.seats} seat(s) · final fare{" "}
                  {item.status === "COMPLETED"
                    ? taka(item.currentFarePaisa)
                    : "not charged"}
                </p>
                {item.fareBreakdown?.length > 0 && (
                  <details>
                    <summary>Fare breakdown</summary>
                    <p>
                      Base: {taka(item.fareRule.baseFarePaisa * item.seats)}
                    </p>
                    {item.fareBreakdown.map((part, index) => (
                      <p key={index}>
                        {part.from} → {part.to} · {part.km} km ·{" "}
                        {part.discountBps != null
                          ? `${part.occupiedSeats} occupied seats · ${part.discountBps / 100}% discount`
                          : taka(part.paisa)}
                      </p>
                    ))}
                  </details>
                )}
                <p>
                  Payment: {paymentLabel(item.paymentMethod)} ·{" "}
                  {item.paymentStatus}
                  {item.paidAt
                    ? ` · ${new Date(item.paidAt).toLocaleString()}`
                    : ""}
                </p>
                {item.driverName && (
                  <p>
                    Driver: {item.driverName} · {item.vehicleName} ·{" "}
                    {item.vehicleRegistrationNumber}
                  </p>
                )}
                <Timeline events={item.history} />
                {item.status === "COMPLETED" && (
                  <PassengerReviewForm
                    rideId={item.id}
                    existing={reviews[item.id]}
                    onSaved={(review) =>
                      setReviews((current) => ({
                        ...current,
                        [item.id]: review,
                      }))
                    }
                  />
                )}
              </>
            )}
          </details>
        ))}
      </div>
      {pages > 1 && (
        <div className="history-pagination">
          <button
            className="retry-button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="retry-button"
            disabled={page >= pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
