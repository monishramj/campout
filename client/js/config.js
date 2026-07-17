// Central config + the C++ contract mirrored on the client.
//
// COUPLING: DIR and ITEM below MUST match the enums in server/src/types.h.
// C++ is the source of truth; if those enums change, change them here too.
// (InputType: MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT — declaration order is
//  the integer value sent over the wire. ItemType: FUEL, MELEE, FOOD.)

export const DIR = Object.freeze({
  UP: 0,
  DOWN: 1,
  LEFT: 2,
  RIGHT: 3,
});

export const ITEM = Object.freeze({
  FUEL: 0,
  MELEE: 1,
  FOOD: 2,
});

// TileType enum order from types.h: GRASS, HOUSE_FLOOR, WALL, FOREST, WATER.
export const TILE = Object.freeze({
  GRASS: 0,
  HOUSE_FLOOR: 1,
  WALL: 2,
  FOREST: 3,
  WATER: 4,
});

export const TILE_COLORS = Object.freeze({
  [TILE.GRASS]: 0x4a7c3a,
  [TILE.HOUSE_FLOOR]: 0x8a6d3b,
  [TILE.WALL]: 0x4d4d52,
  [TILE.FOREST]: 0x1f3d1a,
  [TILE.WATER]: 0x2a5a8a,
});

export const ITEM_COLORS = Object.freeze({
  [ITEM.FUEL]: 0xff8c00,
  [ITEM.MELEE]: 0xd0d0d0,
  [ITEM.FOOD]: 0xe0392b,
});

export const ITEM_NAMES = Object.freeze({
  [ITEM.FUEL]: "Fuel",
  [ITEM.MELEE]: "Weapon",
  [ITEM.FOOD]: "Food",
});

export const PLAYER_SPEED = 0.2;

// Rendering
export const TILE_SIZE = 32; // pixels per tile
export const CAMERA_ZOOM = 3; // io-style follow zoom (map is small)

export const COLOR_SELF = 0xffe14d;
export const COLOR_OTHER = 0x4db8ff;
export const COLOR_FIRE_LIT = 0xff6622;
export const COLOR_FIRE_OUT = 0x555555;

export const RENDER_DELAY_MS = 200;

// Beyond this much prediction error the correction is real (we mispredicted
// through a wall, or respawned) and must jump, not glide, or the player visibly
// slides through geometry. Smaller errors get absorbed across the step window --
// see the render* interpolation in main.js.
export const CORRECTION_SNAP = 2.0; // tiles

// Network / cadence
export const ENDPOINTS = Object.freeze({
  guest: "/guest",
  login: "/login",
  register: "/register",
  map: "/map",
  ws: "/ws",
});

export const INPUT_MS = 50; // how often held movement keys are sent

export function wsUrl() {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${ENDPOINTS.ws}`;
}
