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

window.addEventListener('DOMContentLoaded', () => {
  initHud();
  document.getElementById('btn-guest').addEventListener('click', startGuest);
  document.getElementById('btn-login').addEventListener('click', notImplemented);
  document.getElementById('btn-register').addEventListener('click', notImplemented);
  document.getElementById('btn-respawn').addEventListener('click', () => {
    hide('death-overlay');
    startGuest();
  });
});

function notImplemented() {
  setAuthMsg('Login/Register arrives in a later phase — use Play as Guest for now.');
}

async function startGuest() {
  try {
    setAuthMsg('');
    ({ sess_id: sessId } = await net.guest());
    const mapData = await net.getMap();
    hide('login-overlay');
    show('hud');
    startGame(mapData);
    startPolling();
  } catch (e) {
    show('login-overlay');
    setAuthMsg(`Could not reach server: ${e.message}`);
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
