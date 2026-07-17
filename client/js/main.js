// Bootstrap: wires the login overlay, sets up ws snapshots, nd starts /
// restarts the Phaser game. The scene reads the latest snapshot through a
// closure so the network loop and render loop stay decoupled.

import * as net from "./network.js";
import { GameScene } from "./scene.js";
import { initHud } from "./hud.js";
import {
  RENDER_DELAY_MS,
  PLAYER_SPEED,
  TILE,
  DIR,
  INPUT_MS,
  CORRECTION_SNAP,
} from "./config.js";

let game = null;
let sessId = null;
let startSession = null;
let snapshotBuffer = [];
let mapData = null;
let predictedX = null;
let predictedY = null;
// predicted* is the hard authoritative value reconciliation resets and replays
// against -- it has to stay exact or replays compound the error. render* is what
// actually gets drawn.
//
// predicted* advances in discrete PLAYER_SPEED jumps at INPUT_MS cadence -- a
// 20Hz staircase. Easing toward it (velocity proportional to the remaining gap)
// renders every step as fast-then-slow: a 20Hz velocity ripple that reads as
// shimmer. So instead we interpolate ACROSS the step window: stepFrom* is where
// the render was when the step began, stepAt is when, and render* walks that
// span at constant velocity -- arriving exactly as the next step lands. Same
// reason other players look smooth (getLerpState interpolates them over time).
// Reconciliation just moves the target, so corrections bend the rest of the
// current window instead of snapping.
let renderX = null;
let renderY = null;
let stepFromX = null;
let stepFromY = null;
let stepAt = 0;
let pendingInputs = [];
let nextSeq = 0;

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

// Fold one input cycle's held directions into a single intent vector, mirroring
// move_player_intent(): per-axis assignment, last one wins. C++ folds every
// message it receives in a tick into ONE intent and applies ONE capped step, so
// prediction has to use the same unit -- predicting per-message runs ahead by
// sqrt(2) on diagonals and reconciliation yanks it back every snapshot.
function _dirsToIntent(dirs) {
  let dx = 0;
  let dy = 0;
  for (const dir of dirs) {
    switch (dir) {
      case DIR.LEFT:
        dx = -1;
        break;
      case DIR.RIGHT:
        dx = 1;
        break;
      case DIR.UP:
        dy = 1;
        break;
      case DIR.DOWN:
        dy = -1;
        break;
    }
  }
  return { dx, dy };
}

function is_passable(x, y, mapData) {
  const t = mapData.tiles[Math.floor(x)][Math.floor(y)];
  switch (t) {
    case TILE.GRASS:
      return true;
    case TILE.HOUSE_FLOOR:
      return true;
    default:
      return false;
  }
}

function apply_player_movement(x, y, dx, dy, mapData) {
  let mag = Math.sqrt(dx * dx + dy * dy);
  let nx,
    ny,
    step = 0;
  if (mag > 0) {
    step = Math.min(PLAYER_SPEED, mag) / mag;
    nx = x + dx * step;
    ny = y + dy * step;
  }
  if (nx >= 0 && nx < mapData.width && ny >= 0 && ny < mapData.height) {
    if (is_passable(nx, ny, mapData)) {
      return { x: nx, y: ny };
    } else if (is_passable(nx, y, mapData)) {
      return { x: nx, y };
    } else if (is_passable(x, ny, mapData)) {
      return { x, y: ny };
    }
  }
  return { x, y };
}

// dirs: every direction held this input cycle. One seq per CYCLE, not per key --
// the whole cycle is one predicted step, matching one server tick.
function sendMove(dirs) {
  const { dx, dy } = _dirsToIntent(dirs);
  const seq = nextSeq++;
  if (predictedX !== null && predictedY !== null) {
    // Anchor the window to the OLD predicted, not to renderX. Phaser ticks its
    // Clock before Scene.update, so renderX here is still mid-window (~2/3 in) --
    // anchoring there restarts the span short of its target, and the render
    // stalls for one whole frame every window (a 20Hz micro-stutter). Spanning
    // predicted_old -> predicted_new is exactly one step, so each frame moves
    // exactly PLAYER_SPEED/frames-per-window.
    stepFromX = predictedX;
    stepFromY = predictedY;
    stepAt = performance.now();
    ({ x: predictedX, y: predictedY } = apply_player_movement(
      predictedX,
      predictedY,
      dx,
      dy,
      mapData,
    ));
  }
  pendingInputs.push({ seq, dirs });
  // protocol carries one dir per message, so a diagonal is still 2 messages --
  // they share a seq, and C++ folds them into one intent on arrival.
  for (const dir of dirs) net.sendInput(dir, seq);
}

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

  const me = msg.players.find((p) => p.sess_id === sessId);
  if (!me) return;

  pendingInputs = pendingInputs.filter((inp) => inp.seq > me.last_procs_seq);
  predictedX = me.x;
  predictedY = me.y;
  for (const inp of pendingInputs) {
    const { dx, dy } = _dirsToIntent(inp.dirs);
    ({ x: predictedX, y: predictedY } = apply_player_movement(
      predictedX,
      predictedY,
      dx,
      dy,
      mapData,
    ));
  }
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

function startGame(mapDataArg) {
  mapData = mapDataArg;
  if (game) {
    game.destroy(true);
    game = null;
  }
  snapshotBuffer = [];
  predictedX = null;
  predictedY = null;
  renderX = null;
  renderY = null;
  stepFromX = null;
  stepFromY = null;
  stepAt = 0;
  pendingInputs = [];
  nextSeq = 0;

  const data = {
    sessId,
    mapData,
    getState: () => {
      const state = getLerpState(
        snapshotBuffer,
        performance.now() - RENDER_DELAY_MS,
      );
      if (!state || predictedX === null) return state;

      if (
        renderX === null ||
        stepFromX === null ||
        Math.hypot(predictedX - renderX, predictedY - renderY) > CORRECTION_SNAP
      ) {
        renderX = predictedX;
        renderY = predictedY;
      } else {
        const t = Math.min((performance.now() - stepAt) / INPUT_MS, 1);
        renderX = Phaser.Math.Linear(stepFromX, predictedX, t);
        renderY = Phaser.Math.Linear(stepFromY, predictedY, t);
      }

      return {
        ...state,
        players: state.players.map((p) =>
          p.sess_id === sessId ? { ...p, x: renderX, y: renderY } : p,
        ),
      };
    },
    onDeath: handleDeath,
    sendMove,
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
