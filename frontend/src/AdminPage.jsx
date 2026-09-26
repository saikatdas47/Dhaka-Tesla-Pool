import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Brand from "./Brand.jsx";
import DriverReviews from "./DriverReviews.jsx";
import { adminApi } from "./api.js";
function DriverDetails({ driver }) {
  return (
    <dl>
      <div>
        <dt>Username</dt>
        <dd>{driver.username}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{driver.email}</dd>
      </div>
      <div>
        <dt>Phone</dt>
        <dd>{driver.phone}</dd>
      </div>
      <div>
        <dt>Licence</dt>
        <dd>{driver.licenseNumber}</dd>
      </div>
      <div>
        <dt>Licence expires</dt>
        <dd>
          {driver.licenseExpiry
            ? new Date(driver.licenseExpiry).toLocaleDateString()
            : "—"}
        </dd>
      </div>
      <div>
        <dt>Tesla</dt>
        <dd>{driver.vehicleModel}</dd>
      </div>
      <div>
        <dt>Registration</dt>
        <dd>{driver.vehicleRegistrationNumber}</dd>
      </div>
      <div>
        <dt>Color</dt>
        <dd>{driver.vehicleColor}</dd>
      </div>
      <div>
        <dt>Seats</dt>
        <dd>{driver.passengerSeats}</dd>
      </div>
      <div>
        <dt>Usual area</dt>
        <dd>{driver.serviceArea}</dd>
      </div>
      <div>
        <dt>Current area</dt>
        <dd>{driver.currentArea || "Not selected"}</dd>
      </div>
      <div>
        <dt>Availability</dt>
        <dd>{driver.availability}</dd>
      </div>
      <div>
        <dt>Location source</dt>
        <dd>{driver.locationSource || "manual"}</dd>
      </div>
      <div>
        <dt>Location updated</dt>
        <dd>
          {driver.locationUpdatedAt
            ? new Date(driver.locationUpdatedAt).toLocaleString()
            : "Not set"}
        </dd>
      </div>
      <div>
        <dt>Email verified</dt>
        <dd>
          {driver.emailVerifiedAt
            ? new Date(driver.emailVerifiedAt).toLocaleString()
            : "Not verified"}
        </dd>
      </div>
      <div>
        <dt>Joined</dt>
        <dd>
          {driver.createdAt ? new Date(driver.createdAt).toLocaleString() : "—"}
        </dd>
      </div>
    </dl>
  );
}

function PassengerDetails({ passenger }) {
  return (
    <dl>
      <div>
        <dt>Username</dt>
        <dd>{passenger.username}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{passenger.email}</dd>
      </div>
      <div>
        <dt>Phone</dt>
        <dd>{passenger.phone || "Not provided"}</dd>
      </div>
      <div>
        <dt>Email verified</dt>
        <dd>
          {passenger.emailVerifiedAt
            ? new Date(passenger.emailVerifiedAt).toLocaleString()
            : "Not verified"}
        </dd>
      </div>
      <div>
        <dt>Joined</dt>
        <dd>
          {passenger.createdAt
            ? new Date(passenger.createdAt).toLocaleString()
            : "—"}
        </dd>
      </div>
    </dl>
  );
}

function FareSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [base, setBase] = useState("");
  const [perKm, setPerKm] = useState("");
  const [discount, setDiscount] = useState("");
  const [sharing, setSharing] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function showSettings(value) {
    setSettings(value);
    setBase((value.baseFarePaisa / 100).toFixed(2));
    setPerKm((value.perKmPaisa / 100).toFixed(2));
    setDiscount(String(value.sharedDiscountPercent));
    setSharing({
      discountBpsPerKm2: String((value.discountBpsPerKm2 ?? 150) / 100),
      discountBpsPerKm3: String((value.discountBpsPerKm3 ?? 200) / 100),
      discountBpsPerKm4: String((value.discountBpsPerKm4 ?? 250) / 100),
      maxDiscountBps: String((value.maxDiscountBps ?? 3000) / 100),
    });
  }

  useEffect(() => {
    let current = true;
    adminApi("/fare-settings")
      .then((value) => {
        if (current) showSettings(value);
      })
      .catch((failure) => {
        if (current) setError(failure.message);
      });
    return () => {
      current = false;
    };
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (
      ![base, perKm].every((value) => /^\d+(\.\d{1,2})?$/.test(value)) ||
      !/^\d+$/.test(discount) ||
      !Object.values(sharing).every(
        (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 100,
      )
    ) {
      setError(
        "Use amounts with up to two decimal places and a whole-number discount.",
      );
      return;
    }
    setBusy(true);
    try {
      const value = await adminApi("/fare-settings", {
        method: "PUT",
        body: JSON.stringify({
          baseFarePaisa: Math.round(Number(base) * 100),
          perKmPaisa: Math.round(Number(perKm) * 100),
          sharedDiscountPercent: Number(discount),
          ...Object.fromEntries(
            Object.entries(sharing).map(([key, value]) => [
              key,
              Math.round(Number(value) * 100),
            ]),
          ),
        }),
      });
      showSettings(value);
      setMessage("Saved. New estimates and new rides now use these rates.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-heading">
        <span className="eyebrow">FARE SETTINGS</span>
        <h1>Ride pricing</h1>
        <p>
          Set the fare rules used by new estimates and ride requests. Existing
          rides keep their saved fare.
        </p>
      </div>
      <section className="info-card admin-fare-card">
        {settings ? (
          <>
            <p className="driver-note">
              {settings.configured
                ? `Last saved ${new Date(settings.updatedAt).toLocaleString()}`
                : "Using initial demo rates until you save your own."}
            </p>
            <form onSubmit={save}>
              <label className="field">
                Base fare (৳)
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="0.01"
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                Per approximate kilometre (৳)
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  value={perKm}
                  onChange={(event) => setPerKm(event.target.value)}
                  required
                />
              </label>
              {[
                ["discountBpsPerKm2", "2 occupied seats: discount per km (%)"],
                ["discountBpsPerKm3", "3 occupied seats: discount per km (%)"],
                ["discountBpsPerKm4", "4 occupied seats: discount per km (%)"],
                ["maxDiscountBps", "Maximum total discount (%)"],
              ].map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={sharing[key] || ""}
                    onChange={(event) =>
                      setSharing((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              ))}
              <p className="driver-note">
                Discount = travelled km × rate for occupied seats, capped at the
                maximum. Pool-start snapshots protect ongoing trips.
              </p>
              <button className="retry-button" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save fare settings"}
              </button>
            </form>
          </>
        ) : (
          !error && <p>Loading fare settings…</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </>
  );
}

export default function AdminPage({ onAuthenticated, onLoggedOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const detailMatch = location.pathname.match(
    /^\/admin\/(review|drivers|passengers)\/([a-f\d]{24})$/i,
  );
  const detailId = detailMatch?.[2];
  const detailSection = detailMatch?.[1];
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [section, setSection] = useState("overview");
  const [drivers, setDrivers] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [field, setField] = useState("all");
  const [seats, setSeats] = useState("");
  const [applied, setApplied] = useState({
    search: "",
    field: "all",
    seats: "",
  });
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const next = location.pathname.split("/")[2];
    setSection(
      [
        "review",
        "drivers",
        "passengers",
        "statistics",
        "fare-settings",
      ].includes(next)
        ? next
        : "overview",
    );
  }, [location.pathname]);

  const searchParams = new URLSearchParams({
    page: String(page),
    q: applied.search,
    field: applied.field,
  });
  let listPath = "/drivers?" + searchParams;
  if (section === "review") {
    listPath = "/drivers/pending?page=" + page;
  } else if (section === "passengers") {
    listPath = "/passengers?" + searchParams;
  } else {
    searchParams.set("seats", applied.seats);
    listPath = "/drivers?" + searchParams;
  }
  useEffect(() => {
    adminApi("/me")
      .then((result) => {
        setUsername(result.username);
        setSignedIn(true);
        onAuthenticated();
      })
      .catch(() => onLoggedOut())
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    const refresh = () =>
      adminApi("/overview")
        .then(setOverview)
        .catch((failure) => setError(failure.message));
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn || !["review", "drivers", "passengers"].includes(section))
      return;
    let current = true;
    adminApi(listPath)
      .then((result) => {
        if (!current) return;
        if (section === "passengers") setPassengers(result.passengers);
        else setDrivers(result.drivers);
        setPages(result.pages);
      })
      .catch((failure) => {
        if (current) setError(failure.message);
      });
    return () => {
      current = false;
    };
  }, [signedIn, section, page, applied]);
  useEffect(() => {
    if (!signedIn || !detailId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let current = true;
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    adminApi(
      `/${detailSection === "passengers" ? "passengers" : "drivers"}/${detailId}`,
    )
      .then((result) => {
        if (current) setDetail(result.passenger || result.driver);
      })
      .catch((failure) => {
        if (current) setDetailError(failure.message);
      })
      .finally(() => {
        if (current) setDetailLoading(false);
      });
    return () => {
      current = false;
    };
  }, [signedIn, detailId, detailSection]);

  async function login(event) {
    event.preventDefault();
    setError("");
    try {
      await adminApi("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setPassword("");
      setSignedIn(true);
      onAuthenticated();
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function fillLocalAdmin() {
    setError("");
    try {
      const result = await adminApi("/local-autofill");
      setUsername(result.username);
      setPassword(result.password);
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function review(id, status) {
    if (
      status === "unverified" &&
      !window.confirm(
        "Remove this driver's approval? The driver will go offline.",
      )
    )
      return;
    setWorkingId(id);
    setError("");
    try {
      const changed = await adminApi("/drivers/" + id + "/verification", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setDetail(changed.driver);
      const [list, summary] = await Promise.all([
        adminApi(listPath),
        adminApi("/overview"),
      ]);
      setDrivers(list.drivers);
      setPages(list.pages);
      setOverview(summary);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setWorkingId("");
    }
  }
  async function logout() {
    try {
      await adminApi("/logout", { method: "POST" });
    } finally {
      setSignedIn(false);
      setDrivers([]);
      onLoggedOut();
    }
  }
  function chooseSection(next) {
    setSection(next);
    setDrivers([]);
    setPassengers([]);
    setPage(1);
    setSearch("");
    setField("all");
    setSeats("");
    setApplied({ search: "", field: "all", seats: "" });
    setError("");
    navigate(next === "overview" ? "/admin" : "/admin/" + next);
  }
  function openDriver(driver, from) {
    setDetail(driver);
    navigate(`/admin/${from}/${driver.id}`);
  }
  function openPassenger(passenger) {
    setDetail(passenger);
    navigate(`/admin/passengers/${passenger.id}`);
  }
  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setApplied({ search: search.trim(), field, seats });
  }

  if (loading)
    return (
      <div className="loading-screen">
        <Brand />
        <p>Getting ready…</p>
      </div>
    );
  if (!signedIn)
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <Brand />
          <span className="eyebrow">ADMIN ACCESS</span>
          <h1>Admin Panel</h1>
          <p>Sign in to manage Dhaka Tesla Pool.</p>
          <form onSubmit={login}>
            <label className="field">
              Admin username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" type="submit">
              Sign in <span aria-hidden="true">→</span>
            </button>
          </form>
          {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
            <div className="demo-logins">
              <span className="card-kicker">QUICK DEMO LOGIN</span>
              <p>Only for this local development app.</p>
              <div>
                <button type="button" onClick={fillLocalAdmin}>
                  Use Admin demo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Brand light />
        <p className="admin-sidebar-label">ADMIN PANEL</p>
        <nav aria-label="Admin sections">
          <button
            className={section === "overview" ? "active" : ""}
            onClick={() => chooseSection("overview")}
          >
            Overview
          </button>
          <button
            className={section === "statistics" ? "active" : ""}
            onClick={() => chooseSection("statistics")}
          >
            Statistics
          </button>
          <button
            className={section === "review" ? "active" : ""}
            onClick={() => chooseSection("review")}
          >
            Driver review{" "}
            <span>
              {(overview?.pending ?? 0) + (overview?.unverified ?? 0)}
            </span>
          </button>
          <button
            className={section === "drivers" ? "active" : ""}
            onClick={() => chooseSection("drivers")}
          >
            Drivers
          </button>
          <button
            className={section === "passengers" ? "active" : ""}
            onClick={() => chooseSection("passengers")}
          >
            Passengers
          </button>
          <button
            className={section === "fare-settings" ? "active" : ""}
            onClick={() => chooseSection("fare-settings")}
          >
            Fare settings
          </button>
        </nav>
        <button className="admin-sidebar-logout" onClick={logout}>
          Log out
        </button>
      </aside>
      <main className="admin-content">
        <div className="admin-topline">
          <span>Admin Panel</span>
          <span>Signed in as {username || "Admin"}</span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {section === "overview" && (
          <>
            <div className="admin-heading">
              <span className="eyebrow">OVERVIEW</span>
              <h1>Welcome to your dashboard</h1>
              <p>Accounts and driver approvals at a glance.</p>
            </div>
            <div className="admin-stats-grid">
              {[
                ["Passengers", overview?.passengers],
                ["Drivers", overview?.drivers],
                ["Pending review", overview?.pending],
                ["Approved", overview?.approved],
              ].map(([label, count]) => (
                <div className="admin-stat" key={label}>
                  <span>{label}</span>
                  <strong>{count ?? "—"}</strong>
                </div>
              ))}
            </div>
            <section className="info-card admin-shortcut">
              <span className="card-kicker">DRIVER REVIEW</span>
              <h2>New driver applications</h2>
              <p>Check details before approving or rejecting.</p>
              <button
                className="retry-button"
                onClick={() => chooseSection("review")}
              >
                Open requests →
              </button>
            </section>
          </>
        )}
        {section === "statistics" && (
          <>
            <div className="admin-heading">
              <span className="eyebrow">STATISTICS</span>
              <h1>Account statistics</h1>
              <p>Current figures from MongoDB Atlas.</p>
            </div>
            <div className="admin-stats-grid">
              {[
                ["Passengers", overview?.passengers],
                ["Drivers", overview?.drivers],
                ["Pending", overview?.pending],
                ["Approved", overview?.approved],
                ["Rejected", overview?.rejected],
              ].map(([label, count]) => (
                <div className="admin-stat" key={label}>
                  <span>{label}</span>
                  <strong>{count ?? "—"}</strong>
                </div>
              ))}
            </div>
          </>
        )}
        {section === "fare-settings" && <FareSettingsPanel />}
        {detailId && (
          <>
            <button
              className="retry-button admin-back"
              onClick={() => navigate(`/admin/${detailSection}`)}
            >
              ← Back to{" "}
              {detailSection === "review"
                ? "Driver review"
                : detailSection === "passengers"
                  ? "Passengers"
                  : "Drivers"}
            </button>
            {detail && detail.id === detailId ? (
              detailSection === "passengers" ? (
                <>
                  <div className="admin-detail-heading">
                    <img
                      src={detail.avatarUrl || "/default-avatar.svg"}
                      alt=""
                    />
                    <div>
                      <span className="eyebrow">PASSENGER PROFILE</span>
                      <h1>{detail.name}</h1>
                      <p>@{detail.username}</p>
                    </div>
                  </div>
                  <section className="info-card admin-detail-card">
                    <h2>Account information</h2>
                    <PassengerDetails passenger={detail} />
                  </section>
                </>
              ) : (
                <>
                  <div className="admin-detail-heading">
                    <img
                      src={detail.avatarUrl || "/default-avatar.svg"}
                      alt=""
                    />
                    <div>
                      <span className="eyebrow">DRIVER PROFILE</span>
                      <h1>{detail.name}</h1>
                      <p>
                        @{detail.username} ·{" "}
                        <span
                          className={`verification-status ${detail.verificationStatus}`}
                        >
                          {detail.verificationStatus}
                        </span>
                      </p>
                    </div>
                  </div>
                  <section className="info-card admin-detail-card">
                    <h2>Personal & vehicle information</h2>
                    <DriverDetails driver={detail} />
                  </section>
                  <section className="info-card admin-detail-card">
                    <h2>Verification history</h2>
                    {detail.verificationHistory?.length ? (
                      <ol className="admin-timeline">
                        {detail.verificationHistory.map((event, index) => (
                          <li key={index}>
                            <strong>{event.status}</strong>
                            <span>
                              {event.at
                                ? new Date(event.at).toLocaleString()
                                : "Date unavailable"}{" "}
                              · {event.by || "System"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>No previous decision recorded.</p>
                    )}
                  </section>
                  {["pending", "unverified"].includes(
                    detail.verificationStatus,
                  ) && (
                    <div className="profile-actions">
                      <button
                        className="retry-button"
                        disabled={Boolean(workingId)}
                        onClick={() => review(detail.id, "approved")}
                      >
                        Approve driver
                      </button>
                      <button
                        className="retry-button reject-button"
                        disabled={Boolean(workingId)}
                        onClick={() => review(detail.id, "rejected")}
                      >
                        Reject driver
                      </button>
                    </div>
                  )}
                  {["approved", "rejected"].includes(
                    detail.verificationStatus,
                  ) && (
                    <div className="profile-actions">
                      <button
                        className="retry-button reject-button"
                        disabled={Boolean(workingId)}
                        onClick={() => review(detail.id, "unverified")}
                      >
                        Mark unverified
                      </button>
                    </div>
                  )}
                  <DriverReviews
                    endpoint={`/api/admin/drivers/${detail.id}/reviews`}
                  />
                </>
              )
            ) : (
              <p role={detailError ? "alert" : undefined}>
                {detailError ||
                  (detailLoading
                    ? "Loading account details…"
                    : "Account details unavailable.")}
              </p>
            )}
          </>
        )}
        {!detailId && section === "review" && (
          <>
            <div className="admin-heading">
              <span className="eyebrow">DRIVER REVIEW</span>
              <h1>New requests</h1>
              <p>
                Open a request to check all information and make a decision.
              </p>
            </div>
            {drivers.length === 0 ? (
              <section className="info-card">
                <h2>No pending requests</h2>
                <p>New applications will appear here.</p>
              </section>
            ) : (
              <div className="admin-driver-list">
                {drivers.map((driver) => (
                  <button
                    className="admin-driver-line"
                    key={driver.id}
                    onClick={() => openDriver(driver, "review")}
                  >
                    <img
                      src={driver.avatarUrl || "/default-avatar.svg"}
                      alt=""
                    />
                    <strong>{driver.name}</strong>
                    <span>@{driver.username}</span>
                    <span
                      className={`admin-line-status ${driver.verificationStatus}`}
                    >
                      {driver.verificationStatus === "unverified"
                        ? "Unverified"
                        : "Pending review"}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!detailId && section === "drivers" && (
          <>
            <div className="admin-heading">
              <span className="eyebrow">DRIVERS</span>
              <h1>Drivers</h1>
              <p>
                Search a driver, then open their full profile and verification
                history.
              </p>
            </div>
            <form className="admin-search" onSubmit={applySearch}>
              <label className="field">
                Search by
                <select
                  value={field}
                  onChange={(event) => setField(event.target.value)}
                >
                  <option value="all">All fields</option>
                  <option value="username">Username</option>
                  <option value="licence">Licence number</option>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="field">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Username or licence number"
                />
              </label>
              <label className="field">
                Seats
                <select
                  value={seats}
                  onChange={(event) => setSeats(event.target.value)}
                >
                  <option value="">All seats</option>
                  <option value="2">2 seats</option>
                  <option value="3">3 seats</option>
                  <option value="4">4 seats</option>
                </select>
              </label>
              <button className="retry-button" type="submit">
                Search
              </button>
            </form>
            {drivers.length === 0 ? (
              <section className="info-card">
                <h2>No drivers found</h2>
                <p>Try another search or seat filter.</p>
              </section>
            ) : (
              <div className="admin-driver-list">
                {drivers.map((driver) => (
                  <button
                    className="admin-driver-line"
                    key={driver.id}
                    onClick={() => openDriver(driver, "drivers")}
                  >
                    <img
                      src={driver.avatarUrl || "/default-avatar.svg"}
                      alt=""
                    />
                    <strong>{driver.name}</strong>
                    <span>@{driver.username}</span>
                    <span
                      className={`admin-line-status ${driver.verificationStatus}`}
                    >
                      {driver.verificationStatus}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!detailId && section === "passengers" && (
          <>
            <div className="admin-heading">
              <span className="eyebrow">PASSENGERS</span>
              <h1>Passenger accounts</h1>
              <p>View account information. Ride history stays private.</p>
            </div>
            <form
              className="admin-search admin-search-passengers"
              onSubmit={applySearch}
            >
              <label className="field">
                Search by
                <select
                  value={field}
                  onChange={(event) => setField(event.target.value)}
                >
                  <option value="all">All fields</option>
                  <option value="username">Username</option>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
              </label>
              <label className="field">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, username, email or phone"
                />
              </label>
              <button className="retry-button" type="submit">
                Search
              </button>
            </form>
            {passengers.length === 0 ? (
              <section className="info-card">
                <h2>No passengers found</h2>
                <p>Try another search.</p>
              </section>
            ) : (
              <div className="admin-driver-list">
                {passengers.map((passenger) => (
                  <button
                    className="admin-driver-line"
                    key={passenger.id}
                    onClick={() => openPassenger(passenger)}
                  >
                    <img
                      src={passenger.avatarUrl || "/default-avatar.svg"}
                      alt=""
                    />
                    <strong>{passenger.name}</strong>
                    <span>@{passenger.username}</span>
                    <span className="admin-line-status">Passenger</span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {["review", "drivers", "passengers"].includes(section) &&
          !detailId &&
          pages > 1 && (
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
      </main>
    </div>
  );
}
