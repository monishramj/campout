// The Phaser scene: draws the static map once, then repositions player / item /
// campfire markers from the latest /state snapshot each frame, and emits held-
// key movement on a fixed timer.

import {
  TILE_SIZE, CAMERA_ZOOM, TILE_COLORS, ITEM_COLORS,
  COLOR_SELF, COLOR_OTHER, COLOR_FIRE_LIT, COLOR_FIRE_OUT,
  DIR, INPUT_MS,
} from './config.js';
import { sendInput, sendAction } from './network.js';
import { updateHud } from './hud.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.sessId = data.sessId;
    this.mapData = data.mapData;       // { width, height, tiles[x][y] }
    this.getState = data.getState;     // () => latest /state snapshot | null
    this.onDeath = data.onDeath;       // () => void, fired once when we vanish
    this.dead = false;
    this.everSeen = false;             // guards against the add_player startup race
  }

  create() {
    this.W = this.mapData.width;
    this.H = this.mapData.height;

    this.cameras.main.setBounds(0, 0, this.W * TILE_SIZE, this.H * TILE_SIZE);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setBackgroundColor(0x12140f);

    this.drawTiles();

    // Marker pools keyed by session id (players/campsites); items are rebuilt
    // each poll since they disappear on pickup.
    this.playerMarkers = new Map();
    this.campMarkers = new Map();
    this.itemMarkers = [];

    // Movement: track held WASD and emit on a fixed cadence (decoupled from the
    // 60fps render so we send at the rate the server expects, not per frame).
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.time.addEvent({ delay: INPUT_MS, loop: true, callback: this.sendHeldMoves, callbackScope: this });

    // Actions are one-shot on keypress (not held).
    this.input.keyboard.on('keydown-E', () => !this.dead && sendAction(this.sessId, 'CONSUME'));
    this.input.keyboard.on('keydown-Q', () => !this.dead && sendAction(this.sessId, 'USE_FUEL'));
  }

  drawTiles() {
    const g = this.add.graphics().setDepth(0);
    for (let x = 0; x < this.W; x++) {
      for (let y = 0; y < this.H; y++) {
        const t = this.mapData.tiles[x][y];
        g.fillStyle(TILE_COLORS[t] ?? 0x000000, 1);
        // Vertical flip: the server's y-axis points up (MOVE_UP increases y) but
        // screen-space y points down, so row (H-1-y) puts "up" visually up.
        g.fillRect(x * TILE_SIZE, (this.H - 1 - y) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Continuous tile coords -> pixel center, with the same vertical flip as tiles.
  // ! NEEDS FIXING 
  toPixel(ex, ey) {
    return {
      px: ex * TILE_SIZE + TILE_SIZE / 2,
      py: (this.H - ey - 0.5) * TILE_SIZE,
    };
  }

  sendHeldMoves() {
    if (this.dead) return;
    const k = this.keys;
    if (k.W.isDown) sendInput(this.sessId, DIR.UP);
    if (k.S.isDown) sendInput(this.sessId, DIR.DOWN);
    if (k.A.isDown) sendInput(this.sessId, DIR.LEFT);
    if (k.D.isDown) sendInput(this.sessId, DIR.RIGHT);
  }

  update() {
    const state = this.getState();
    if (!state) return;

    const players = state.players || [];
    this.renderPlayersAndCamps(players);
    this.renderItems(state.items || []);

    const me = players.find((p) => p.sess_id === this.sessId);
    updateHud(me);

    // C++ removes a player from the state on death; our disappearance == death.
    // Only count it once we've actually seen ourselves alive, so the brief
    // window before C++ processes add_player doesn't read as a death.
    if (me) {
      this.everSeen = true;
    } else if (this.everSeen && !this.dead) {
      this.dead = true;
      this.onDeath();
    }
  }

  renderPlayersAndCamps(players) {
    const seen = new Set();

    for (const p of players) {
      seen.add(p.sess_id);

      // Campfire at the player's campsite, color/scale reflecting fuel.
      const cpos = this.toPixel(p.campsite_x, p.campsite_y);
      let camp = this.campMarkers.get(p.sess_id);
      if (!camp) {
        camp = this.add.circle(cpos.px, cpos.py, TILE_SIZE * 0.35, COLOR_FIRE_LIT).setDepth(1);
        this.campMarkers.set(p.sess_id, camp);
      }
      const lit = p.fuel > 0;
      camp.setPosition(cpos.px, cpos.py);
      camp.setFillStyle(lit ? COLOR_FIRE_LIT : COLOR_FIRE_OUT);
      camp.setScale(lit ? 0.6 + 0.4 * (p.fuel / 100) : 0.5);

      // Player marker.
      const pos = this.toPixel(p.x, p.y);
      let m = this.playerMarkers.get(p.sess_id);
      if (!m) {
        const isSelf = p.sess_id === this.sessId;
        m = this.add.rectangle(pos.px, pos.py, TILE_SIZE * 0.7, TILE_SIZE * 0.7,
          isSelf ? COLOR_SELF : COLOR_OTHER).setDepth(3);
        this.playerMarkers.set(p.sess_id, m);
        if (isSelf) this.cameras.main.startFollow(m, true, 0.2, 0.2);
      }
      m.setPosition(pos.px, pos.py);
    }

    // Drop markers for players (and their campsites) no longer present.
    for (const [sid, m] of this.playerMarkers) {
      if (seen.has(sid)) continue;
      m.destroy();
      this.playerMarkers.delete(sid);
      const c = this.campMarkers.get(sid);
      if (c) { c.destroy(); this.campMarkers.delete(sid); }
    }
  }

  renderItems(items) {
    // Few items, and they vanish on pickup — cheapest correct approach is to
    // rebuild the small set each poll rather than diff it.
    for (const m of this.itemMarkers) m.destroy();
    this.itemMarkers = [];
    for (const it of items) {
      const pos = this.toPixel(it.x, it.y);
      const m = this.add.rectangle(pos.px, pos.py, TILE_SIZE * 0.45, TILE_SIZE * 0.45,
        ITEM_COLORS[it.type] ?? 0xffffff).setDepth(2);
      this.itemMarkers.push(m);
    }
  }
}
