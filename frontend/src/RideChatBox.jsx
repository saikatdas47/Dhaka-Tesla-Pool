import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export default function RideChatBox({ role, rideId, title }) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [closed, setClosed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const connection = io({ auth: { role }, withCredentials: true });
    setSocket(connection); setMessages([]); setClosed(false); setConnecting(true); setError("");
    connection.on("connect", () => {
      connection.emit("chat:join", { rideId }, (reply) => {
        if (!active) return;
        setConnecting(false);
        if (!reply?.ok) { setError(reply?.error || "Could not open chat."); return; }
        setMessages(reply.data.messages);
        setError("");
      });
    });
    connection.on("connect_error", (failure) => {
      if (!active) return;
      setConnecting(false); setError(failure.message || "Chat connection failed.");
    });
    connection.on("chat:message", (message) => {
      if (active) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    connection.on("chat:closed", () => {
      if (active) { setClosed(true); setMessages([]); setError(""); connection.disconnect(); }
    });
    return () => { active = false; connection.disconnect(); };
  }, [role, rideId]);

  function send(event) {
    event.preventDefault();
    if (!socket?.connected || !text.trim() || sending) return;
    setSending(true); setError("");
    socket.emit("chat:send", { rideId, text }, (reply) => {
      setSending(false);
      if (reply?.ok) setText("");
      else setError(reply?.error || "Message could not be sent.");
    });
  }

  return <section className="ride-chat" aria-label={title}>
    <div className="ride-chat-heading"><div className="ride-chat-title"><span className="ride-chat-icon" aria-hidden="true">✉</span><div><strong>{title}</strong><small>Private ride conversation</small></div></div><span className={`ride-chat-state ${closed ? "closed" : socket?.connected ? "live" : "waiting"}`}><i aria-hidden="true" />{closed ? "Closed" : connecting ? "Connecting" : socket?.connected ? "Live" : "Disconnected"}</span></div>
    {!closed && <><div className="ride-chat-messages" role="log" aria-live="polite">{messages.length ? messages.map((message) => <div className={`ride-chat-bubble ${message.senderRole === role ? "mine" : "theirs"}`} key={message.id}><small>{message.senderRole === role ? "You" : message.senderRole === "driver" ? "Driver" : "Passenger"} · {message.sentAt ? new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</small><p>{message.text}</p></div>) : <div className="ride-chat-empty"><span aria-hidden="true">✉</span><strong>No messages yet</strong><p>Say hello or share your pickup details.</p></div>}</div><form onSubmit={send} className="ride-chat-form"><label className="sr-only" htmlFor={`chat-${rideId}`}>Message</label><input id={`chat-${rideId}`} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" disabled={connecting || !socket?.connected} /><button type="submit" disabled={sending || !text.trim() || !socket?.connected}>{sending ? "Sending…" : "Send →"}</button></form></>}
    {closed && <p className="ride-chat-closed">Driver arrived. This conversation is now closed.</p>}
    <p className="ride-chat-note">Messages are removed when the driver arrives or the ride is cancelled.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
