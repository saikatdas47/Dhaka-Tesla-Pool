import { io } from "socket.io-client";
import { roleFetch } from "./tabAuth.js";

// Socket notification triggers the existing authenticated data loader.
export function watchRideUpdates(role, refresh) {
  let active = true;
  let pending = false;
  let queued = false;
  const socket = io({ auth: { role }, withCredentials: true });
  async function update() {
    if (!active) return;
    if (pending) {
      queued = true;
      return;
    }
    pending = true;
    try {
      await refresh();
    } catch {
      /* Existing screen keeps its last state. */
    } finally {
      pending = false;
      if (queued) {
        queued = false;
        update();
      }
    }
  }
  socket.on("connect", update); // Reconnect also catches missed changes.
  socket.on("rides:changed", update);
  socket.on("disconnect", (reason) => {
    if (active && reason === "io server disconnect") socket.connect();
  });
  socket.on("connect_error", async () => {
    // roleFetch refreshes expired cookies; next handshake uses those cookies.
    try {
      const response = await roleFetch(
        role,
        `/api/${role === "driver" ? "drivers" : "passengers"}/me`,
      );
      if (active && response.ok) socket.connect();
    } catch {
      /* Retry on the next connection attempt. */
    }
  });
  return () => {
    active = false;
    socket.disconnect();
  };
}
