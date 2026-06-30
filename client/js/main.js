// Bootstrap: wires the login overlay, owns the /state poll loop, and starts /
// restarts the Phaser game. The scene reads the latest snapshot through a
// closure (getState) so the network loop and render loop stay decoupled.

import { POLL_MS } from './config.js';
import * as net from './network.js';
import { GameScene } from './scene.js';
import { initHud } from './hud.js';

let game = null;
let sessId = null;
let latestState = null;
let pollTimer = null;
let startSession = null;

window.addEventListener('DOMContentLoaded', () => {
  initHud();
  document.getElementById('btn-guest').addEventListener('click', startGuest);
  document.getElementById('btn-login').addEventListener('click', startLogin);
  document.getElementById('btn-register').addEventListener('click', startRegister);
  document.getElementById('btn-respawn').addEventListener('click', () => {
    hide('death-overlay');
    (startSession ?? startGuest)();
  });
});

async function beginSession(sessIdValue) {
  sessId = sessIdValue;
  const mapData = await net.getMap();
  hide('login-overlay');
  show('hud');
  startGame(mapData);
  startPolling();
}

async function startGuest() {
  try {
    setAuthMsg('');
    startSession = startGuest;
    const { sess_id } = await net.guest();
    await beginSession(sess_id);
  } catch (e) {
    show('login-overlay');
    setAuthMsg(`Could not reach server: ${e.message}`);
  }
}

async function startLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) { setAuthMsg('Please enter a username and password.'); return; }
  try {
    setAuthMsg('');
    startSession = startLogin;
    const { sess_id } = await net.login(username, password);
    await beginSession(sess_id);
  } catch (e) {
    show('login-overlay');
    setAuthMsg(e.message);
  }
}

async function startRegister() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) { setAuthMsg('Please enter a username and password.'); return; }
  try {
    setAuthMsg('');
    startSession = startRegister;
    const { sess_id } = await net.register(username, password);
    await beginSession(sess_id);
  } catch (e) {
    show('login-overlay');
    setAuthMsg(e.message);
  }
}

function startGame(mapData) {
  if (game) {
    game.destroy(true);
    game = null;
  }
  latestState = null;

  const data = {
    sessId,
    mapData,
    getState: () => latestState,
    onDeath: handleDeath,
  };

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#12140f',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
  });

  // Wait for boot before adding/starting the scene so the data is delivered to
  // init()/create() cleanly (avoids racing the engine's async boot).
  game.events.once('ready', () => {
    game.scene.add('game', GameScene, true, data);
  });
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      latestState = await net.getState();
    } catch (e) {
      // Transient gateway/socket hiccup — keep last snapshot, try next tick.
    }
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function handleDeath() {
  stopPolling();
  hide('hud');
  show('death-overlay');
}

// --- tiny DOM helpers ---
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function setAuthMsg(t) { document.getElementById('auth-msg').textContent = t; }
