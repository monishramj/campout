// Thin fetch wrappers over the gateway REST API. Same origin (served by
// FastAPI), so no base URL / CORS needed. The gateway forwards these to the
// C++ server over the Unix socket.

import { ENDPOINTS } from './config.js';

export async function guest() {
  const res = await fetch(ENDPOINTS.guest, { method: 'POST' });
  if (!res.ok) throw new Error(`guest failed: ${res.status}`);
  return res.json(); // { sess_id }
}

export async function login(username, password) {
  const res = await fetch(ENDPOINTS.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function getState() {
  const res = await fetch(ENDPOINTS.state);
  if (!res.ok) throw new Error(`state failed: ${res.status}`);
  return res.json(); // { tick, players[], items[] }
}

export async function sendInput(sessId, dir) {
  return post({ type: 'move_player', sess_id: sessId, dir });
}

export async function sendAction(sessId, action) {
  return post({ type: 'action', sess_id: sessId, action });
}

async function post(body) {
  // Fire-and-forget: gateway returns immediately, C++ applies next tick.
  await fetch(ENDPOINTS.input, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
