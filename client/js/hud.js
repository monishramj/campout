// DOM/CSS HUD overlay. Kept out of the canvas so styling is plain CSS and the
// game render stays purely the Phaser scene. Called once per state poll.

import { ITEM_NAMES, ITEM_COLORS } from './config.js';

const els = {};

export function initHud() {
  els.health = document.getElementById('bar-health');
  els.food = document.getElementById('bar-food');
  els.fuel = document.getElementById('bar-fuel');
  els.healthVal = document.getElementById('val-health');
  els.foodVal = document.getElementById('val-food');
  els.fuelVal = document.getElementById('val-fuel');
  els.inventory = document.getElementById('inventory');
}

// player: the entry from /state for our session (or undefined if dead/missing).
export function updateHud(player) {
  if (!player) return;
  setBar(els.health, els.healthVal, player.health);
  setBar(els.food, els.foodVal, player.food);
  setBar(els.fuel, els.fuelVal, player.fuel);
  renderInventory(player.inventory || []);
}

function setBar(barEl, valEl, value) {
  const pct = clamp(value, 0, 100);
  barEl.style.width = `${pct}%`;
  valEl.textContent = Math.round(pct);
}

function renderInventory(items) {
  // items: [{ type, subtype, amt }]
  els.inventory.innerHTML = '';
  for (const it of items) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = toCss(ITEM_COLORS[it.type]);
    const label = document.createElement('span');
    label.textContent = `${ITEM_NAMES[it.type] ?? '?'} ×${it.amt}`;
    slot.append(swatch, label);
    els.inventory.appendChild(slot);
  }
}

function toCss(hex) {
  return `#${(hex ?? 0).toString(16).padStart(6, '0')}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
