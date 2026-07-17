// Bootstrap: wires the login overlay, sets up ws snapshots, nd starts /
// restarts the Phaser game. The scene reads the latest snapshot through a
// closure so the network loop and render loop stay decoupled.

import * as net from "./network.js";
import { GameScene } from "./scene.js";
import { initHud } from "./hud.js";
import { RENDER_DELAY_MS } from "./config.js";

let game = null;
let sessId = null;
let startSession = null;
let snapshotBuffer = [];

const SNAPSHOT_MAX_BUFFER = 10;

window.addEventListener("DOMContentLoaded", () => {
  initHud();
  document.getElementById("btn-guest").addEventListener("click", startGuest);
  document.getElementById("btn-login").addEventListener("click", startLogin);
  document
    .getElementById("btn-register")
    .addEventListener("click", startRegister);
  document.getElementById("btn-respawn").addEventListener("click", () => {
    hide("death-overlay");
    (startSession ?? startGuest)();
  });
  document.getElementById("btn-lobby").addEventListener("click", () => {
    hide("death-overlay");
    show("login-overlay");
    startSession = null;
  });
});

function getLerpState(buff, renderTime) {
  if (buff.length === 0) return null;

  if (renderTime <= buff[0]._timestamp) return buff[0];
  if (renderTime >= buff[buff.length - 1]._timestamp)
    return buff[buff.length - 1];

  let s0 = null;
  let s1 = null;
  for (let i = 1; i < buff.length; i++) {
    if (buff[i]._timestamp > renderTime) {
      s1 = buff[i];
      s0 = buff[i - 1];
      break;
    }
  }

  const t = (renderTime - s0._timestamp) / (s1._timestamp - s0._timestamp);

  const lerpPlayers = [];
  for (const p1 of s1.players) {
    const p0 = s0.players.find((p) => p.sess_id === p1.sess_id);
    if (p0) {
      lerpPlayers.push({
        ...p1,
        x: Phaser.Math.Linear(p0.x, p1.x, t), // maybe change lerp function
        y: Phaser.Math.Linear(p0.y, p1.y, t),
      });
    } else {
      lerpPlayers.push(p1);
    }
  }

  return { ...s1, players: lerpPlayers };
}

function handleSnapshot(msg) {
  msg._timestamp = performance.now();
  snapshotBuffer.push(msg);
  if (snapshotBuffer.length > SNAPSHOT_MAX_BUFFER) snapshotBuffer.shift();
}

function handleAuthFail(msg) {
  hide("hud");
  show("login-overlay");
  setAuthMsg(`Connection rejected: ${msg.reason}`);
}

function handleKicked(msg) {
  hide("hud");
  show("login-overlay");
  setAuthMsg("This session was opened in another tab.");
  startSession = null;
}

function handleClose() {
  hide("hud");
  show("login-overlay");
  setAuthMsg("Connection lost. Please log back in.");
}

async function beginSession(sessIdValue) {
  sessId = sessIdValue;
  const mapData = await net.getMap();
  hide("login-overlay");
  show("hud");
  startGame(mapData);
  net.connect(sessId, {
    onSnapshot: handleSnapshot,
    onAuthFail: handleAuthFail,
    onKicked: handleKicked,
    onClose: handleClose,
  });
}

async function startGuest() {
  try {
    setAuthMsg("");
    startSession = startGuest;
    const { sess_id } = await net.guest();
    await beginSession(sess_id);
  } catch (e) {
    show("login-overlay");
    setAuthMsg(`Could not reach server: ${e.message}`);
  }
}

async function startLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) {
    setAuthMsg("Please enter a username and password.");
    return;
  }
  try {
    setAuthMsg("");
    startSession = startLogin;
    const { sess_id } = await net.login(username, password);
    await beginSession(sess_id);
  } catch (e) {
    show("login-overlay");
    setAuthMsg(e.message);
  }
}

async function startRegister() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) {
    setAuthMsg("Please enter a username and password.");
    return;
  }
  try {
    setAuthMsg("");
    startSession = startRegister;
    const { sess_id } = await net.register(username, password);
    await beginSession(sess_id);
  } catch (e) {
    show("login-overlay");
    setAuthMsg(e.message);
  }
}

function startGame(mapData) {
  if (game) {
    game.destroy(true);
    game = null;
  }
  snapshotBuffer = [];

  const data = {
    sessId,
    mapData,
    getState: () =>
      getLerpState(snapshotBuffer, performance.now() - RENDER_DELAY_MS),
    onDeath: handleDeath,
  };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    backgroundColor: "#12140f",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  });

  // Wait for boot before adding/starting the scene so the data is delivered to
  // init()/create() cleanly (avoids racing the engine's async boot).
  game.events.once("ready", () => {
    game.scene.add("game", GameScene, true, data);
  });
}

async function handleDeath() {
  net.disconnect();
  document.getElementById("stat-days").textContent = "--";
  document.getElementById("stat-kills").textContent = "--";
  hide("hud");
  show("death-overlay");

  // death_updates() in Python polls C++ every 5s before writing to Postgres,
  // so the session row may not be finalized yet — poll until is_active is false.
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const stats = await net.getSessionStats(sessId);
      if (!stats.is_active) {
        document.getElementById("stat-days").textContent = stats.days_survived;
        document.getElementById("stat-kills").textContent = stats.kills;
        break;
      }
    } catch (_) {}
  }
}

// --- tiny DOM helpers ---
function show(id) {
  document.getElementById(id).classList.remove("hidden");
}
function hide(id) {
  document.getElementById(id).classList.add("hidden");
}
function setAuthMsg(t) {
  document.getElementById("auth-msg").textContent = t;
}
