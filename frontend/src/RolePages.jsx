import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DriverRides, PassengerRides, RideHistory } from "./RidePanels.jsx";
import DriverReviews from "./DriverReviews.jsx";
import { roleFetch } from "./tabAuth.js";

async function accountApi(role, path, options = {}) {
  const collection = role === "driver" ? "drivers" : "passengers";
  const isForm = options.body instanceof FormData;
  const response = await roleFetch(role, `/api/${collection}${path}`, { ...options, headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Please try again.");
  return body.data;
}

function AccountMenu({ role, account, onLogout }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    function closeOutside(event) { if (!menuRef.current?.contains(event.target)) setOpen(false); }
    function closeEscape(event) { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  async function logout() {
    setLoggingOut(true); setError("");
    try { await accountApi(role, "/logout", { method: "POST" }); onLogout(); navigate("/login", { replace: true, state: { role } }); }
    catch (failure) { setError(failure.message); }
    finally { setLoggingOut(false); }
  }
  function moveMenuFocus(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  }
  return <div className="account-menu-wrap" ref={menuRef}><button ref={triggerRef} type="button" className="account-menu-trigger" aria-expanded={open} aria-haspopup="menu" aria-controls="account-menu" onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus()); } }}><img src={account.avatarUrl || "/default-avatar.svg"} alt="" /><span className="account-menu-name">{account.name}</span><span aria-hidden="true">⌄</span></button>{open && <div className="account-menu-panel" id="account-menu" role="menu" onKeyDown={moveMenuFocus}><span className="account-menu-role">{role} account</span><Link role="menuitem" to={`/${role}`} onClick={() => setOpen(false)}>Dashboard</Link><Link role="menuitem" to={`/${role}/profile`} onClick={() => setOpen(false)}>Your Profile</Link><Link role="menuitem" to={`/${role}/history`} onClick={() => setOpen(false)}>History</Link><button role="menuitem" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}</button></div>}{error && <p className="form-error account-menu-error" role="alert">{error}</p>}</div>;
}

function ProfileEditForm({ role, account, onUpdated, onCancel }) {
  const isDriver = role === "driver";
  const original = { name: account.name, ...(isDriver ? { phone: account.phone, licenseNumber: account.licenseNumber, licenseExpiry: new Date(new Date(account.licenseExpiry).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10), vehicleModel: account.vehicleModel, vehicleRegistrationNumber: account.vehicleRegistrationNumber, vehicleColor: account.vehicleColor, passengerSeats: String(account.passengerSeats), serviceArea: account.serviceArea } : {}) };
  const [fields, setFields] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function field(label, key, type = "text") { return <label className="field" key={key}>{label}<input type={type} value={fields[key]} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} required /></label>; }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError("");
    try { const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original[key])); if (!Object.keys(changes).length) throw new Error("Change a field before saving."); const result = await accountApi(role, "/me", { method: "PATCH", body: JSON.stringify(changes) }); onUpdated(result[role]); onCancel(); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return <form className="profile-edit-form" onSubmit={save}>{field("Full name", "name")}{isDriver && <div className="profile-edit-grid">{field("Mobile number", "phone", "tel")}{field("Driving licence number", "licenseNumber")}{field("Licence expiry", "licenseExpiry", "date")}<label className="field">Tesla model<select value={fields.vehicleModel} onChange={(event) => setFields((current) => ({ ...current, vehicleModel: event.target.value }))}>{["Model 3", "Model Y", "Model S", "Model X"].map((model) => <option key={model}>{model}</option>)}</select></label>{field("Vehicle registration", "vehicleRegistrationNumber")}{field("Vehicle color", "vehicleColor")}<label className="field">Passenger seats<select value={fields.passengerSeats} onChange={(event) => setFields((current) => ({ ...current, passengerSeats: event.target.value }))}>{[2, 3, 4].map((count) => <option key={count}>{count}</option>)}</select></label>{field("Usual service area", "serviceArea")}</div>}{isDriver && <p className="driver-note">Changing licence or vehicle details requires admin review again.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="profile-actions"><button className="retry-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button><button className="retry-button" type="button" onClick={onCancel}>Cancel</button></div></form>;
}

function ProfilePage({ role, account, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const isDriver = role === "driver";
  async function refresh() { try { onUpdated((await accountApi(role, "/me"))[role]); } catch { /* Keep current profile. */ } }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image no larger than 5 MB."); return; }
    setUploading(true); setError("");
    try { const body = new FormData(); body.append("avatar", file); onUpdated((await accountApi(role, "/avatar", { method: "POST", body }))[role]); }
    catch (failure) { setError(failure.message); await refresh(); }
    finally { setUploading(false); }
  }
  async function retryAvatar() {
    setUploading(true); setError("");
    try { onUpdated((await accountApi(role, "/avatar/retry", { method: "POST" }))[role]); }
    catch (failure) { setError(failure.message); await refresh(); }
    finally { setUploading(false); }
  }
  async function removeAvatar() {
    if (!window.confirm("Remove your profile photo?")) return;
    setRemoving(true); setError("");
    try { onUpdated((await accountApi(role, "/avatar", { method: "DELETE" }))[role]); }
    catch (failure) { setError(failure.message); await refresh(); }
    finally { setRemoving(false); }
  }
  return <><div className="page-heading"><span className="eyebrow">YOUR ACCOUNT</span><h1>Your Profile</h1><p>Keep your details current. Email and username cannot be changed.</p></div><div className="home-grid profile-page-grid"><section className="info-card"><span className="card-kicker">PERSONAL DETAILS</span><div className="avatar-row"><img className="avatar-preview" src={account.avatarUrl || "/default-avatar.svg"} alt={`${account.name}'s profile`} /><div className="avatar-controls"><label className="avatar-upload">{uploading ? "Uploading…" : account.avatarUrl ? "Change photo" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading || account.avatarPending} /></label><small>JPG, PNG or WebP · up to 5 MB</small>{account.avatarPending && <button className="retry-button" onClick={retryAvatar} disabled={uploading}>Retry saved photo</button>}{account.avatarUrl && <button className="retry-button reject-button" type="button" onClick={removeAvatar} disabled={uploading || removing || account.avatarPending}>{removing ? "Removing…" : "Remove photo"}</button>}</div></div><dl><div><dt>Name</dt><dd>{account.name}</dd></div><div><dt>Username</dt><dd>{account.username || "Not set"}</dd></div><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Phone</dt><dd>{account.phone || "Not set"}</dd></div>{isDriver && <><div><dt>Licence</dt><dd>{account.licenseNumber}</dd></div><div><dt>Expires</dt><dd>{new Date(account.licenseExpiry).toLocaleDateString()}</dd></div></>}</dl><button className="retry-button" onClick={() => setEditing((value) => !value)}>{editing ? "Close edit" : "Edit profile"}</button>{editing && <ProfileEditForm key={`${role}-${account.id}`} role={role} account={account} onUpdated={onUpdated} onCancel={() => setEditing(false)} />}</section><section className="info-card"><span className="card-kicker">{isDriver ? "DRIVER & VEHICLE" : "ACCOUNT"}</span>{isDriver ? <><h2>{account.vehicleModel}</h2><p className={`status-pill verification-status ${account.verificationStatus}`}>Verification {account.verificationStatus}</p><dl><div><dt>Registration</dt><dd>{account.vehicleRegistrationNumber}</dd></div><div><dt>Color</dt><dd>{account.vehicleColor}</dd></div><div><dt>Seats</dt><dd>{account.passengerSeats}</dd></div><div><dt>Usual area</dt><dd>{account.serviceArea}</dd></div><div><dt>Current area</dt><dd>{account.currentArea || "Not selected"}</dd></div><div><dt>Location</dt><dd>{account.locationSource || "manual"}{account.locationUpdatedAt ? ` · updated ${new Date(account.locationUpdatedAt).toLocaleString()}` : ""}</dd></div></dl><p className="driver-note">Usual service area is a profile detail. Current area is selected separately on the Dashboard; it is not live GPS.</p></> : <><h2>Passenger account</h2><p>Your ride controls are on the Dashboard. Completed and cancelled journeys are under History.</p><Link className="retry-button" to="/passenger/history">View History</Link></>}</section></div>{error && <p className="form-error" role="alert">{error}</p>}</>;
}

export default function RolePage({ role, account, page, onUpdated, onLogout, Brand }) {
  const isDriver = role === "driver";
  return <div className={`home-layout ${isDriver ? "driver-home" : ""}`}><header className="home-header"><Brand /><nav className="role-nav" aria-label="Main navigation"><Link className={page === "dashboard" ? "active" : ""} to={`/${role}`}>Dashboard</Link><Link className={page === "history" ? "active" : ""} to={`/${role}/history`}>History</Link></nav><AccountMenu role={role} account={account} onLogout={onLogout} /></header><main className="home-main">{page === "dashboard" && <><div className={`home-hero ${isDriver ? "driver-hero" : ""}`}><div><span className="eyebrow">{isDriver ? "DRIVER DASHBOARD" : "PASSENGER DASHBOARD"}</span><h1>Welcome back, <em>{account.name.split(" ")[0]}.</em></h1><p>{isDriver ? "Set your current area, go online, and manage your shared trip." : "Choose your route, find a seat, and follow your journey."}</p></div><div className="hero-art" aria-hidden="true"><div className="art-road"><span className="art-dot one"/><span className="art-dot two"/><span className="art-dot three"/></div><span className="art-label top">BANANI</span><span className="art-label bottom">MOHAKHALI</span><span className="art-circle">D<span>•</span></span></div></div>{isDriver ? <DriverRides driver={account} onDriverUpdated={onUpdated} /> : <PassengerRides />}</>}{page === "profile" && <><ProfilePage role={role} account={account} onUpdated={onUpdated} />{isDriver && <DriverReviews endpoint="/api/drivers/reviews" />}</>}{page === "history" && <RideHistory role={role} />}</main><footer className="home-footer">Share a seat. Split the fare. Survive Dhaka traffic.</footer></div>;
}
