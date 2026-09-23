import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";

async function api(role, path, options = {}, mayRefresh = true) {
  const collection = role === "driver" ? "drivers" : "passengers";
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api/${collection}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...options.headers },
  });
  if (response.status === 401 && mayRefresh && !["/login", "/register", "/refresh-token"].includes(path)) {
    const refreshed = await fetch(`/api/${collection}/refresh-token`, { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return api(role, path, options, false);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data.data;
}

async function emailOtp(path, body) {
  const response = await fetch(`/api/email-otp${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Email verification failed.");
  return data.data;
}

function Brand({ light = false }) {
  return (
    <Link to="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Dhaka Tesla Pool home">
      <span className="brand-mark">D<span>•</span></span>
      <span className="brand-name">DHAKA <strong>TESLA</strong> POOL</span>
    </Link>
  );
}

function AuthPage({ mode, role, onAuthenticated }) {
  const isRegister = mode === "register";
  const isDriver = role === "driver";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoQuery = searchParams.get("demo");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [identity, setIdentity] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [passengerSeats, setPassengerSeats] = useState("4");
  const [serviceArea, setServiceArea] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [registrationToken, setRegistrationToken] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [demoAccounts, setDemoAccounts] = useState(null);

  useEffect(() => {
    if (isRegister) return;
    let active = true;
    fetch("/api/demo-accounts", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active) setDemoAccounts(result?.data || null); })
      .catch(() => {});
    return () => { active = false; };
  }, [isRegister]);

  useEffect(() => {
    if (demoAccounts && demoQuery === role) {
      setIdentity(demoAccounts[role].username);
      setPassword(demoAccounts[role].password);
    }
  }, [demoAccounts, role, demoQuery]);

  function chooseDemo(demoRole) {
    if (demoRole === role) {
      setIdentity(demoAccounts[demoRole].username);
      setPassword(demoAccounts[demoRole].password);
    } else {
      navigate(`/login/${demoRole}?demo=${demoRole}`);
    }
  }

  async function sendCode() {
    setError("");
    setVerificationMessage("");
    setSubmitting(true);
    try {
      await emailOtp("/send", { role, email: identity });
      setOtpSent(true);
      setRegistrationToken("");
      setVerificationMessage("A six-digit code was sent to your email. It expires in 5 minutes.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode() {
    setError("");
    setSubmitting(true);
    try {
      const result = await emailOtp("/verify", { role, email: identity, otp });
      setRegistrationToken(result.registrationToken);
      setVerificationMessage("Email verified. Finish your registration within 10 minutes.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (isRegister && !registrationToken) {
      setError("Verify your email before creating the account.");
      return;
    }
    setSubmitting(true);
    try {
      const body = isRegister
        ? { name, username, email: identity, password, registrationToken, ...(isDriver ? { phone, licenseNumber, licenseExpiry, vehicleModel, vehicleRegistrationNumber, vehicleColor, passengerSeats: Number(passengerSeats), serviceArea } : {}) }
        : { identity, password };
      const result = await api(role, isRegister ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onAuthenticated(role, result[role]);
      navigate(`/${role}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="story-panel">
        <Brand light />
        <div className="story-copy">
          <span className="eyebrow light-eyebrow">A better way across the city</span>
          <h1>Dhaka moves better <em>together.</em></h1>
          <p>Share a seat. Split the fare. Make your everyday journey a little lighter.</p>
          <div className="route-card" aria-label="Example route from Banani to Mohakhali">
            <div className="route-stop"><span className="stop-dot start" /><span><small>PICKUP</small>Banani, Dhaka</span></div>
            <div className="route-line" />
            <div className="route-stop"><span className="stop-dot end" /><span><small>DESTINATION</small>Mohakhali, Dhaka</span></div>
            <span className="route-note">A city worth sharing.</span>
          </div>
        </div>
        <p className="story-footer">Made for the roads we know by heart.</p>
      </section>

      <main className="form-panel">
        <div className="mobile-brand"><Brand /></div>
        <div className={`auth-box ${isDriver && isRegister ? "driver-form" : ""}`}>
          <span className="eyebrow">{isRegister ? "GET STARTED" : "WELCOME BACK"}</span>
          <h2>{isRegister ? `Create your ${role} account` : `Sign in as a ${role}`}</h2>
          <p className="form-intro">{isRegister ? "Choose your role and enter your details." : "Choose the account type you want to use."}</p>

          <div className="role-switch" aria-label="Account type">
            <Link className={!isDriver ? "selected" : ""} to={`/${mode}/passenger`}>Passenger</Link>
            <Link className={isDriver ? "selected" : ""} to={`/${mode}/driver`}>Driver</Link>
          </div>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <label className="field">Full name
                  <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nusrat Rahman" autoComplete="name" minLength="2" maxLength="80" required />
                </label>
                <label className="field">Username
                  <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. nusrat_rahman" minLength="3" maxLength="30" pattern="[A-Za-z0-9_]+" autoComplete="username" required />
                </label>
              </>
            )}
            <label className="field">{isRegister ? "Email address" : "Email or username"}
              <input type={isRegister ? "email" : "text"} value={identity} onChange={(event) => { setIdentity(event.target.value); setOtpSent(false); setRegistrationToken(""); setVerificationMessage(""); }} placeholder={isRegister ? "you@example.com" : "Email or username"} autoComplete={isRegister ? "email" : "username"} required />
            </label>
            {isRegister && <div className="otp-panel">
              <button type="button" className="retry-button" onClick={sendCode} disabled={submitting || !identity || Boolean(registrationToken)}>{otpSent ? "Resend code" : "Send verification code"}</button>
              {otpSent && !registrationToken && <div className="otp-entry"><label className="field">Six-digit email code<input inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} maxLength="6" pattern="[0-9]{6}" placeholder="123456" /></label><button type="button" className="retry-button" onClick={verifyCode} disabled={submitting || otp.length !== 6}>Verify code</button></div>}
              {verificationMessage && <p className="verification-message" role="status">{verificationMessage}</p>}
            </div>}
            {isRegister && isDriver && (
              <div className="driver-fields">
                <p className="form-section-title">Driver and vehicle details</p>
                <label className="field">Mobile number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" required /></label>
                <label className="field">Driving licence number<input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} maxLength="40" required /></label>
                <label className="field">Licence expiry date<input type="date" value={licenseExpiry} onChange={(event) => setLicenseExpiry(event.target.value)} required /></label>
                <label className="field">Tesla model<select value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} required><option value="">Choose model</option><option>Model 3</option><option>Model Y</option><option>Model S</option><option>Model X</option></select></label>
                <label className="field">Vehicle registration number<input value={vehicleRegistrationNumber} onChange={(event) => setVehicleRegistrationNumber(event.target.value)} maxLength="40" required /></label>
                <label className="field">Vehicle color<input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} maxLength="30" required /></label>
                <label className="field">Passenger seats<select value={passengerSeats} onChange={(event) => setPassengerSeats(event.target.value)} required>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
                <label className="field">Usual service area<input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="e.g. Banani, Dhaka" maxLength="80" required /></label>
                <p className="driver-note">Your location is not tracked during signup. Licence and vehicle details will show as pending verification.</p>
              </div>
            )}
            <label className="field">Password
              <span className="password-wrap">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "At least 8 characters" : "Enter your password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 8 : undefined} required />
                <button type="button" className="show-password" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
              </span>
            </label>
            {isRegister && (
              <label className="field">Confirm password
                <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter password again" autoComplete="new-password" required />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={submitting || (isRegister && !registrationToken)}>{submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>

          {!isRegister && demoAccounts && <div className="demo-logins"><span className="card-kicker">QUICK DEMO LOGIN</span><p>Click to fill in a local test account.</p><div><button type="button" onClick={() => chooseDemo("passenger")}>Use Passenger demo</button><button type="button" onClick={() => chooseDemo("driver")}>Use Driver demo</button></div></div>}

          <p className="switch-auth">{isRegister ? "Already have an account?" : "New to Dhaka Tesla Pool?"} <Link to={`/${isRegister ? "login" : "register"}/${role}`}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
        </div>
        <p className="form-footer">© {new Date().getFullYear()} Dhaka Tesla Pool</p>
      </main>
    </div>
  );
}

function Home({ passenger, onLogout, onPassengerUpdated }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  async function handleUsernameSave(event) {
    event.preventDefault();
    setSavingUsername(true);
    setError("");
    try {
      const result = await api("passenger", "/username", { method: "PATCH", body: JSON.stringify({ username: newUsername }) });
      onPassengerUpdated(result.passenger);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingUsername(false);
    }
  }

  async function refreshPassenger() {
    try {
      const result = await api("passenger", "/me");
      onPassengerUpdated(result.passenger);
    } catch {
      // Keep the current profile visible if the refresh fails.
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP image no larger than 5 MB.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("avatar", file);
      const result = await api("passenger", "/avatar", { method: "POST", body });
      onPassengerUpdated(result.passenger);
    } catch (uploadError) {
      setError(uploadError.message);
      await refreshPassenger();
    } finally {
      setUploading(false);
    }
  }

  async function retryAvatar() {
    setUploading(true);
    setError("");
    try {
      const result = await api("passenger", "/avatar/retry", { method: "POST" });
      onPassengerUpdated(result.passenger);
    } catch (uploadError) {
      setError(uploadError.message);
      await refreshPassenger();
    } finally {
      setUploading(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      await api("passenger", "/logout", { method: "POST" });
      onLogout();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="home-layout">
      <header className="home-header">
        <Brand />
        <div className="header-actions"><span className="header-user">{passenger.name}</span><button type="button" className="logout-button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}</button></div>
      </header>
      <main className="home-main">
        <div className="home-hero">
          <div><span className="eyebrow">YOUR HOME</span><h1>Good to have you here,<br /><em>{passenger.name.split(" ")[0]}.</em></h1><p>Your Dhaka Tesla Pool account is ready. The city is full of places to go, and your journey starts here.</p></div>
          <div className="hero-art" aria-hidden="true"><div className="art-road"><span className="art-dot one" /><span className="art-dot two" /><span className="art-dot three" /></div><span className="art-label top">BANANI</span><span className="art-label bottom">MOHAKHALI</span><span className="art-circle">D<span>•</span></span></div>
        </div>
        <div className="home-grid">
          <section className="info-card"><span className="card-kicker">01 / ACCOUNT</span><h2>Your profile</h2><p>You're signed in and ready for the next step.</p>
            <div className="avatar-row">
              {passenger.avatarUrl ? <img className="avatar-preview" src={passenger.avatarUrl} alt={`${passenger.name}'s profile`} /> : <span className="avatar-preview avatar-initial" aria-hidden="true">{passenger.name.charAt(0).toUpperCase()}</span>}
              <div className="avatar-controls">
                <label className="avatar-upload">{uploading ? "Uploading…" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={uploading || passenger.avatarPending} /></label>
                <small>JPG, PNG or WebP · up to 5 MB</small>
                {passenger.avatarPending && <button type="button" className="retry-button" onClick={retryAvatar} disabled={uploading}>Retry saved photo</button>}
              </div>
            </div>
            <dl><div><dt>Name</dt><dd>{passenger.name}</dd></div><div><dt>Username</dt><dd>{passenger.username || "Not set (older account)"}</dd></div><div><dt>Email</dt><dd>{passenger.email}</dd></div><div><dt>Account type</dt><dd>Passenger</dd></div></dl>
            {!passenger.username && <form className="legacy-username-form" onSubmit={handleUsernameSave}><label className="field">Set your username<input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="e.g. nusrat_rahman" minLength="3" maxLength="30" pattern="[A-Za-z0-9_]+" required /></label><button type="submit" className="retry-button" disabled={savingUsername}>{savingUsername ? "Saving…" : "Save username"}</button></form>}
          </section>
          <section className="info-card next-card"><span className="card-kicker">02 / WHAT'S NEXT</span><h2>Ride booking is coming next.</h2><p>Registration and sign in are ready. Ride requests, matching, and fares will be added in the next stage.</p><div className="next-mark" aria-hidden="true">↗</div></section>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </main>
      <footer className="home-footer">Share a seat. Split the fare. Survive Dhaka traffic.</footer>
    </div>
  );
}

function DriverHome({ driver, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      await api("driver", "/logout", { method: "POST" });
      onLogout();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="home-layout driver-home">
      <header className="home-header"><Brand /><div className="header-actions"><span className="header-user">Driver · {driver.name}</span><button className="logout-button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}</button></div></header>
      <main className="home-main">
        <div className="home-hero driver-hero">
          <div><span className="eyebrow">DRIVER DASHBOARD</span><h1>Welcome to the driver's seat, <em>{driver.name.split(" ")[0]}.</em></h1><p>Your driver profile and Tesla details are ready. Ride offers will appear here when that feature is built.</p></div>
          <div className="driver-hero-art" aria-hidden="true"><span className="driver-car">↗</span><span className="driver-hero-caption">DHAKA · TESLA POOL</span></div>
        </div>
        <div className="home-grid">
          <section className="info-card"><span className="card-kicker">01 / DRIVER PROFILE</span><h2>{driver.name}</h2><p className="status-pill">Verification {driver.verificationStatus}</p><dl><div><dt>Username</dt><dd>{driver.username}</dd></div><div><dt>Email</dt><dd>{driver.email}</dd></div><div><dt>Phone</dt><dd>{driver.phone}</dd></div><div><dt>Licence</dt><dd>{driver.licenseNumber}</dd></div><div><dt>Expires</dt><dd>{new Date(driver.licenseExpiry).toLocaleDateString()}</dd></div></dl></section>
          <section className="info-card"><span className="card-kicker">02 / YOUR TESLA</span><h2>{driver.vehicleModel}</h2><p>Your usual driving area: {driver.serviceArea}</p><dl><div><dt>Registration</dt><dd>{driver.vehicleRegistrationNumber}</dd></div><div><dt>Color</dt><dd>{driver.vehicleColor}</dd></div><div><dt>Seats</dt><dd>{driver.passengerSeats} passenger seats</dd></div></dl><p className="driver-note">This area is a profile setting, not live GPS location.</p></section>
        </div>
        <section className="driver-next"><span className="card-kicker">COMING NEXT</span><h2>Ride offers and trips</h2><p>There are no live ride requests yet. Matching, trip status, and earnings will be added in a later stage.</p></section>
        {error && <p className="form-error" role="alert">{error}</p>}
      </main>
      <footer className="home-footer">Share a seat. Split the fare. Survive Dhaka traffic.</footer>
    </div>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState({ passenger: null, driver: null });
  const [checkingSession, setCheckingSession] = useState(true);

  function updateAccount(role, account) {
    setAccounts((current) => ({ ...current, [role]: account }));
  }

  useEffect(() => {
    let active = true;
    Promise.all(["passenger", "driver"].map(async (role) => {
      try { return [role, (await api(role, "/me"))[role]]; }
      catch { return [role, null]; }
    }))
      .then((results) => { if (active) setAccounts(Object.fromEntries(results)); })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  if (checkingSession) return <div className="loading-screen"><Brand /><p>Getting things ready…</p></div>;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={accounts.passenger ? "/passenger" : accounts.driver ? "/driver" : "/login/passenger"} replace />} />
      <Route path="/passenger" element={accounts.passenger ? <Home passenger={accounts.passenger} onLogout={() => updateAccount("passenger", null)} onPassengerUpdated={(value) => updateAccount("passenger", value)} /> : <Navigate to="/login/passenger" replace />} />
      <Route path="/driver" element={accounts.driver ? <DriverHome driver={accounts.driver} onLogout={() => updateAccount("driver", null)} /> : <Navigate to="/login/driver" replace />} />
      <Route path="/login" element={<Navigate to="/login/passenger" replace />} />
      <Route path="/register" element={<Navigate to="/register/passenger" replace />} />
      <Route path="/login/passenger" element={accounts.passenger ? <Navigate to="/passenger" replace /> : <AuthPage key="login-passenger" mode="login" role="passenger" onAuthenticated={updateAccount} />} />
      <Route path="/login/driver" element={accounts.driver ? <Navigate to="/driver" replace /> : <AuthPage key="login-driver" mode="login" role="driver" onAuthenticated={updateAccount} />} />
      <Route path="/register/passenger" element={accounts.passenger ? <Navigate to="/passenger" replace /> : <AuthPage key="register-passenger" mode="register" role="passenger" onAuthenticated={updateAccount} />} />
      <Route path="/register/driver" element={accounts.driver ? <Navigate to="/driver" replace /> : <AuthPage key="register-driver" mode="register" role="driver" onAuthenticated={updateAccount} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
