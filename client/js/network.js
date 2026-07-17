import { ENDPOINTS, wsUrl } from "./config.js";

let socket = null;

export function connect(token, { onSnapshot, onAuthFail, onKicked, onClose }) {
  socket = new WebSocket(wsUrl());

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "authenticate", token }));
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case "snapshot":
        onSnapshot(msg);
        break;
      case "auth_fail":
        onAuthFail(msg);
        break;
      case "kicked":
        onKicked(msg);
        break;
    }
  };

  socket.onclose = () => {
    onClose?.();
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

export function disconnect() {
  if (socket) {
    socket.onclose = null; // intentional close — don't fire handleClose's
    // "connection lost" UI over an intended teardown
    socket.close();
    socket = null;
  }
}

export function sendInput(dir, seq) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "move_player", dir, seq }));
  }
}

export function sendAction(action) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "action", action }));
  }
}

export async function guest() {
  const res = await fetch(ENDPOINTS.guest, { method: "POST" });
  if (!res.ok) throw new Error(`guest failed: ${res.status}`);
  return res.json(); // { sess_id }
}

export async function login(username, password) {
  const res = await fetch(ENDPOINTS.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Login failed: ${res.status}`);
  }
  return res.json(); // { sess_id }
}

export async function register(username, password) {
  const res = await fetch(ENDPOINTS.register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Register failed: ${res.status}`);
  }
  return res.json(); // { sess_id }
}

export async function getMap() {
  const res = await fetch(ENDPOINTS.map);
  if (!res.ok) throw new Error(`map failed: ${res.status}`);
  return res.json(); // { width, height, tiles[x][y] }
}

export async function getSessionStats(sessId) {
  const res = await fetch(`/session/${sessId}/stats`);
  if (!res.ok) throw new Error(`stats failed: ${res.status}`);
  return res.json(); // { days_survived, kills, is_active }
}
