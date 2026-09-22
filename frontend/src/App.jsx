import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";

async function api(path, options = {}) {
  const response = await fetch(`/api/passengers${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}

function Brand({ light = false }) {
  return (
    <Link to="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Dhaka Tesla Pool home">
      <span className="brand-mark">D<span>•</span></span>
      <span className="brand-name">DHAKA <strong>TESLA</strong> POOL</span>
    </Link>
  );
}

function AuthPage({ mode, onAuthenticated }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const body = isRegister ? { name, email, password } : { email, password };
      const result = await api(isRegister ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onAuthenticated(result.passenger);
      navigate("/", { replace: true });
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
        <div className="auth-box">
          <span className="eyebrow">{isRegister ? "GET STARTED" : "WELCOME BACK"}</span>
          <h2>{isRegister ? "Create your account" : "Sign in to your account"}</h2>
          <p className="form-intro">{isRegister ? "Join the pool and get ready for easier trips across Dhaka." : "Good to see you again. Your journey starts here."}</p>

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <label className="field">Full name
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nusrat Rahman" autoComplete="name" minLength="2" maxLength="80" required />
              </label>
            )}
            <label className="field">Email address
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </label>
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
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>

          <p className="switch-auth">{isRegister ? "Already have an account?" : "New to Dhaka Tesla Pool?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link></p>
        </div>
        <p className="form-footer">© {new Date().getFullYear()} Dhaka Tesla Pool</p>
      </main>
    </div>
  );
}

function Home({ passenger, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      await api("/logout", { method: "POST" });
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
          <section className="info-card"><span className="card-kicker">01 / ACCOUNT</span><h2>Your profile</h2><p>You're signed in and ready for the next step.</p><dl><div><dt>Name</dt><dd>{passenger.name}</dd></div><div><dt>Email</dt><dd>{passenger.email}</dd></div><div><dt>Account type</dt><dd>Passenger</dd></div></dl></section>
          <section className="info-card next-card"><span className="card-kicker">02 / WHAT'S NEXT</span><h2>Ride booking is coming next.</h2><p>Registration and sign in are ready. Ride requests, matching, and fares will be added in the next stage.</p><div className="next-mark" aria-hidden="true">↗</div></section>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </main>
      <footer className="home-footer">Share a seat. Split the fare. Survive Dhaka traffic.</footer>
    </div>
  );
}

export default function App() {
  const [passenger, setPassenger] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    api("/me")
      .then((result) => { if (active) setPassenger(result.passenger); })
      .catch(() => { if (active) setPassenger(null); })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  if (checkingSession) return <div className="loading-screen"><Brand /><p>Getting things ready…</p></div>;

  return (
    <Routes>
      <Route path="/" element={passenger ? <Home passenger={passenger} onLogout={() => setPassenger(null)} /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={passenger ? <Navigate to="/" replace /> : <AuthPage key="login" mode="login" onAuthenticated={setPassenger} />} />
      <Route path="/register" element={passenger ? <Navigate to="/" replace /> : <AuthPage key="register" mode="register" onAuthenticated={setPassenger} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
