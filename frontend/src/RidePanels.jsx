import { useEffect, useState } from "react";

async function request(role, path, options = {}, retry = true) {
  const response = await fetch(`/api/rides${path}`, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  if (response.status === 401 && retry) {
    const collection = role === "driver" ? "drivers" : "passengers";
    const refreshed = await fetch(`/api/${collection}/refresh-token`, { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return request(role, path, options, false);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Ride request failed.");
  return body.data;
}

function taka(paisa) { return `৳${(paisa / 100).toFixed(0)}`; }
function paymentLabel(method) { return method === "teslapay" ? "TeslaPay (simulated)" : method === "cash" ? "Cash" : "Not recorded"; }

async function updateDriverAvailability(body, retry = true) {
  const response = await fetch("/api/drivers/availability", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.status === 401 && retry) {
    const refreshed = await fetch("/api/drivers/refresh-token", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return updateDriverAvailability(body, false);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Could not update availability.");
  return result.data.driver;
}

function AreaMap({ areas, drivers = [], selectedArea, assignedArea }) {
  const points = Object.entries(areas);
  const latitudes = points.map(([, [lat]]) => lat);
  const longitudes = points.map(([, [, lng]]) => lng);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  const point = ([lat, lng]) => ({ x: 45 + ((lng - minLng) / (maxLng - minLng)) * 430, y: 340 - ((lat - minLat) / (maxLat - minLat)) * 280 });
  return <div className="area-map"><div className="area-map-title"><strong>Dhaka area map</strong><small>Approximate area positions · not live GPS</small></div><svg viewBox="0 0 520 385" role="img" aria-label="Map of selected Dhaka areas and online drivers"><path d="M70 310 Q170 210 250 260 T465 110 M100 80 Q240 130 400 340 M45 200 Q260 190 475 250" fill="none" stroke="#d8e8da" strokeWidth="16" strokeLinecap="round"/><path d="M70 310 Q170 210 250 260 T465 110 M100 80 Q240 130 400 340 M45 200 Q260 190 475 250" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="8 8"/>{points.map(([name, coordinates]) => { const { x, y } = point(coordinates); const count = drivers.filter((driver) => driver.area === name).length; return <g key={name}><circle cx={x} cy={y} r={name === selectedArea ? 10 : 7} fill={name === selectedArea ? "#d88643" : count ? "#2b7655" : "#9db3a1"} stroke="white" strokeWidth="3"/>{name === assignedArea && <circle cx={x} cy={y} r="15" fill="none" stroke="#3a70c2" strokeWidth="3"/>}<text x={x + 11} y={y - 10} fontSize="12" fill="#244c3a" fontWeight="700">{name}{count ? ` · ${count} online` : ""}</text></g>; })}</svg><p>Green: available driver · Orange: selected area · Blue ring: assigned driver’s last selected area.</p></div>;
}

export function PassengerRides() {
  const [areas, setAreas] = useState(null);
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
    const [mine, nearby] = await Promise.all([request("passenger", "/mine?view=active"), request("passenger", "/nearby-drivers")]);
    setRides(mine.rides);
    setDrivers(nearby.drivers);
  }
  useEffect(() => {
    request("passenger", "/config").then((result) => setAreas(result.areas)).catch((failure) => setError(failure.message));
    refresh().catch((failure) => setError(failure.message));
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setQuote(null); }, [pickupArea, destinationArea, seats]);

  async function estimate() {
    setError("");
    try { setQuote(await request("passenger", "/quote", { method: "POST", body: JSON.stringify({ pickupArea, destinationArea, seats: Number(seats) }) })); }
    catch (failure) { setError(failure.message); }
  }
  async function create(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await request("passenger", "/requests", { method: "POST", body: JSON.stringify({ pickupArea, destinationArea, seats: Number(seats), paymentMethod }) }); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function cancel(id) {
    setBusy(true); setError("");
    try { await request("passenger", `/requests/${id}/cancel`, { method: "PATCH" }); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const active = rides.find((ride) => !["COMPLETED", "CANCELLED"].includes(ride.status));
  const areaNames = Object.keys(areas || {});
  return <section className="ride-section"><div className="ride-section-head"><span className="card-kicker">YOUR JOURNEY</span><h2>Request a shared ride</h2><p>Choose Dhaka areas. Drivers select their location manually for this demo.</p></div>{areas && <AreaMap areas={areas} drivers={drivers} selectedArea={pickupArea} assignedArea={active?.driverArea} />}
    <div className="ride-columns"><form className="info-card ride-form" onSubmit={create}><h3>New ride</h3><label className="field">Pickup<select value={pickupArea} onChange={(event) => setPickupArea(event.target.value)}>{areaNames.map((area) => <option key={area}>{area}</option>)}</select></label><label className="field">Destination<select value={destinationArea} onChange={(event) => setDestinationArea(event.target.value)}>{areaNames.map((area) => <option key={area}>{area}</option>)}</select></label><label className="field">Seats<select value={seats} onChange={(event) => setSeats(event.target.value)}>{[1, 2, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field">Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="teslapay">TeslaPay (simulated)</option></select></label><button type="button" className="retry-button" onClick={estimate}>Estimate fare</button>{quote && <p className="fare-estimate">Solo {taka(quote.soloFarePaisa)} · Shared {taka(quote.pooledFarePaisa)} <small>~{quote.approximateKm} km; shared fare applies when another request joins the pool.</small></p>}<button className="primary-button" type="submit" disabled={busy || Boolean(active) || !areas}>{active ? "Finish your current ride first" : busy ? "Sending…" : "Request ride"}</button></form>
      <div className="info-card"><h3>Current ride</h3>{rides.length === 0 ? <p>No active ride. Create your first request.</p> : <div className="ride-list">{rides.map((ride) => <article className="ride-item" key={ride.id}><strong>{ride.pickupArea} → {ride.destinationArea}</strong><span className="status-pill">{ride.status.replaceAll("_", " ")}</span><p>{ride.seats} seat{ride.seats > 1 ? "s" : ""} · current fare {taka(ride.currentFarePaisa)}{ride.poolSize > 1 ? ` · ${ride.poolSize} passengers sharing` : ""}</p><p>Payment: {paymentLabel(ride.paymentMethod)} · {ride.paymentStatus}</p>{ride.driverName && <p>Driver: {ride.driverName}{ride.driverArea ? ` · last selected area: ${ride.driverArea}` : ""}</p>}{["REQUESTED", "MATCHED", "DRIVER_ARRIVED"].includes(ride.status) && <button type="button" className="retry-button" disabled={busy} onClick={() => cancel(ride.id)}>Cancel ride</button>}</article>)}</div>}</div></div>{error && <p className="form-error" role="alert">{error}</p>}</section>;
}

export function DriverRides({ driver, onDriverUpdated }) {
  const [areas, setAreas] = useState(null);
  const [currentArea, setCurrentArea] = useState(driver.currentArea || "Banani");
  const [offers, setOffers] = useState([]);
  const [pool, setPool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const [available, current, accountResponse] = await Promise.all([request("driver", "/offers"), request("driver", "/driver/current"), fetch("/api/drivers/me", { credentials: "same-origin" })]);
    setOffers(available.offers); setPool(current.pool);
    if (accountResponse.ok) onDriverUpdated((await accountResponse.json()).data.driver);
  }
  useEffect(() => {
    request("driver", "/config").then((result) => setAreas(result.areas)).catch((failure) => setError(failure.message));
    refresh().catch((failure) => setError(failure.message));
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (driver.currentArea) setCurrentArea(driver.currentArea); }, [driver.currentArea]);
  async function saveAvailability(availability) {
    setBusy(true); setError("");
    try { onDriverUpdated(await updateDriverAvailability({ availability, currentArea })); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function accept(id) {
    setBusy(true); setError("");
    try { await request("driver", `/requests/${id}/accept`, { method: "POST" }); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function advance(status) {
    setBusy(true); setError("");
    try { await request("driver", `/pools/${pool.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await refresh(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const next = { MATCHED: ["DRIVER_ARRIVED", "Mark arrived"], DRIVER_ARRIVED: ["STARTED", "Start trip"], STARTED: ["COMPLETED", "Complete trip"] }[pool?.status];
  return <section className="ride-section"><div className="ride-section-head"><span className="card-kicker">DRIVER WORKSPACE</span><h2>Availability and trips</h2><p>Only approved, online drivers see requests from their selected area.</p></div><div className="ride-columns"><div className="info-card"><h3>Your availability</h3><p className="status-pill">{driver.availability || "offline"}</p><label className="field">Current area<select value={currentArea} onChange={(event) => setCurrentArea(event.target.value)}>{Object.keys(areas || { Banani: true }).map((area) => <option key={area}>{area}</option>)}</select></label><div className="profile-actions"><button type="button" className="retry-button" disabled={busy || driver.verificationStatus !== "approved"} onClick={() => saveAvailability("online")}>Save area & go online</button><button type="button" className="retry-button" disabled={busy || driver.availability !== "online"} onClick={() => saveAvailability("offline")}>Go offline</button></div>{driver.verificationStatus !== "approved" && <p className="driver-note">Admin approval is required before going online. An active trip can still be completed after approval is revoked.</p>}</div><div className="info-card"><h3>Current pool</h3>{pool ? <><p><strong>{pool.pickupArea}</strong> · {pool.vehicleName}</p><p>{pool.occupiedSeats}/{pool.capacity} seats occupied · {pool.status.replaceAll("_", " ")}</p><ul className="pool-members">{pool.members.map((member) => <li key={member.requestId}>{member.passengerName || "Passenger"} · {member.seats} seat(s) → {member.destinationArea} · {paymentLabel(member.paymentMethod)}</li>)}</ul>{next && <button type="button" className="retry-button" disabled={busy} onClick={() => advance(next[0])}>{next[1]}</button>}</> : <p>No active pool.</p>}</div></div>{areas && <AreaMap areas={areas} selectedArea={currentArea} />}<div className="info-card ride-offers-card"><h3>Requests in your area</h3>{offers.length === 0 ? <p>No compatible requests right now. Check that you are online and approved.</p> : <div className="ride-list">{offers.map((offer) => <article className="ride-item" key={offer.id}><strong>{offer.pickupArea} → {offer.destinationArea}</strong><p>{offer.seats} seat(s) · fare estimate {taka(offer.soloFarePaisa)}</p><button type="button" className="retry-button" disabled={busy} onClick={() => accept(offer.id)}>Accept & match pool</button></article>)}</div>}</div>{error && <p className="form-error" role="alert">{error}</p>}</section>;
}

function Timeline({ events }) {
  return <ol className="ride-timeline">{(events || []).map((event, index) => <li key={`${event.status}-${index}`}><strong>{event.status.replaceAll("_", " ")}</strong><time>{event.at ? new Date(event.at).toLocaleString() : ""}</time></li>)}</ol>;
}

export function RideHistory({ role }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [payingId, setPayingId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const path = role === "driver" ? `/driver/history?page=${page}` : `/mine?view=history&page=${page}`;
    request(role, path).then((result) => { if (active) { setItems(role === "driver" ? result.pools : result.rides); setPages(result.pages); } }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, page, reload]);
  async function confirmCash(requestId) {
    setPayingId(requestId); setError("");
    try { await request("driver", `/requests/${requestId}/confirm-cash`, { method: "POST" }); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { setPayingId(""); }
  }
  return <><div className="page-heading"><span className="eyebrow">PAST JOURNEYS</span><h1>History</h1><p>{role === "driver" ? "Your completed and cancelled pools." : "Only your own completed and cancelled rides appear here."}</p></div>{loading && <p>Loading history…</p>}{error && <p className="form-error" role="alert">{error}</p>}{!loading && !error && items.length === 0 && <section className="info-card"><h2>No past trips yet</h2><p>Completed and cancelled trips will appear here.</p></section>}<div className="history-list">{items.map((item) => <details className="info-card history-card" key={item.id}><summary><span><strong>{role === "driver" ? `${item.pickupArea} · ${item.vehicleName}` : `${item.pickupArea} → ${item.destinationArea}`}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small></span><span className="status-pill">{item.status.replaceAll("_", " ")}</span></summary>{role === "driver" ? <><p>{item.members.length} passenger(s) · {item.occupiedSeats}/{item.capacity} seats · {item.vehicleRegistrationNumber}</p><ul className="pool-members">{item.members.map((member) => <li key={member.requestId}>{member.passengerName || "Passenger"} · {member.seats} seat(s) → {member.destinationArea} · {member.farePaisa == null ? "No final fare" : taka(member.farePaisa)} · {paymentLabel(member.paymentMethod)} ({member.paymentStatus}){member.paymentMethod === "cash" && member.paymentStatus === "due" && <button type="button" className="retry-button" disabled={Boolean(payingId)} onClick={() => confirmCash(member.requestId)}>{payingId === member.requestId ? "Confirming…" : "Confirm cash received"}</button>}</li>)}</ul><Timeline events={item.history} /></> : <><p>{item.seats} seat(s) · final fare {item.status === "COMPLETED" ? taka(item.currentFarePaisa) : "not charged"}</p><p>Payment: {paymentLabel(item.paymentMethod)} · {item.paymentStatus}{item.paidAt ? ` · ${new Date(item.paidAt).toLocaleString()}` : ""}</p>{item.driverName && <p>Driver: {item.driverName} · {item.vehicleName} · {item.vehicleRegistrationNumber}</p>}<Timeline events={item.history} /></>}</details>)}</div>{pages > 1 && <div className="history-pagination"><button className="retry-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="retry-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}</>;
}
