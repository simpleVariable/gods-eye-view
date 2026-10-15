/**
 * Dogfight — code shared by the browser client and the game server.
 *
 * No Cesium and no DOM in here. The arena is a local tangent-plane frame in
 * metres: x east, y north, z up, with z = 0 as the ground everywhere.
 */

export const ARENA = Object.freeze({
  /** Geodetic anchor the local frame is draped over. */
  anchor: Object.freeze({ lat: 37.775, lon: -122.42 }),
  radiusM: 15_000,
  ceilingM: 6_000,
  /** Seconds a player may stay outside the radius before being destroyed. */
  outOfBoundsGraceS: 8,
});

export const NET = Object.freeze({
  path: '/ws/dogfight',
  tickHz: 30,
  snapshotHz: 15,
  clientStateHz: 20,
  maxPlayers: 24,
  nameMax: 16,
});

export const COMBAT = Object.freeze({
  bulletSpeedMps: 650,
  bulletLifeS: 1.8,
  muzzleOffsetM: 12,
  spreadRad: 0.0025,
  ammoMax: 400,
  ammoRegenPerS: 10,
  /** Ammo needed before a spent gun fires again. */
  ammoRearm: 40,
  respawnMs: 4000,
  spawnProtectMs: 3000,
});

/**
 * Plane roster. `model` files live in /models and follow the project convention
 * (nose −X, +Y up). Rates are rad/s at full stick, speeds are m/s.
 * `scale` only enlarges the model so it reads at dogfight distances; the
 * server hit sphere is `hitRadiusM`.
 */
export const PLANES = Object.freeze({
  c172: {
    id: 'c172', name: 'Cessna 172', role: 'Nimble trainer',
    model: '/models/c172.glb', scale: 2.5, spanM: 11,
    stall: 26, cruise: 50, vmax: 78, thrust: 7,
    pitchRate: 1.5, rollRate: 2.8, yawRate: 0.5,
    hp: 70, damage: 5, fireRate: 10, hitRadiusM: 14,
  },
  citation2: {
    id: 'citation2', name: 'Cessna Citation', role: 'All-rounder',
    model: '/models/citation2.glb', scale: 1.8, spanM: 15,
    stall: 38, cruise: 100, vmax: 150, thrust: 9,
    pitchRate: 1.2, rollRate: 2.2, yawRate: 0.4,
    hp: 100, damage: 5, fireRate: 11, hitRadiusM: 16,
  },
  jet: {
    id: 'jet', name: 'Private Jet', role: 'Fast striker',
    model: '/models/jet.glb', scale: 0.7, spanM: 41,
    stall: 46, cruise: 140, vmax: 220, thrust: 12,
    pitchRate: 1.0, rollRate: 2.0, yawRate: 0.35,
    hp: 85, damage: 6, fireRate: 12, hitRadiusM: 16,
  },
  mq9: {
    id: 'mq9', name: 'MQ-9 Reaper', role: 'Slow sniper',
    model: '/models/mq9.glb', scale: 1.4, spanM: 20,
    stall: 30, cruise: 62, vmax: 100, thrust: 7,
    pitchRate: 1.3, rollRate: 1.7, yawRate: 0.45,
    hp: 95, damage: 9, fireRate: 7, hitRadiusM: 16,
  },
  atr72: {
    id: 'atr72', name: 'ATR 72', role: 'Flying brick',
    model: '/models/atr72.glb', scale: 1.1, spanM: 27,
    stall: 40, cruise: 85, vmax: 115, thrust: 8,
    pitchRate: 0.75, rollRate: 1.1, yawRate: 0.3,
    hp: 220, damage: 4, fireRate: 16, hitRadiusM: 20,
  },
  b789: {
    id: 'b789', name: 'Boeing 787-9', role: 'Heavy tank',
    model: '/models/b789.glb', scale: 1, spanM: 60,
    stall: 56, cruise: 130, vmax: 175, thrust: 8,
    pitchRate: 0.5, rollRate: 0.75, yawRate: 0.2,
    hp: 400, damage: 3, fireRate: 20, hitRadiusM: 30,
  },
});

export const DEFAULT_PLANE = 'citation2';

const GRAVITY = 9.80665;
const TAU = Math.PI * 2;

// ── Small vector helpers (plain [x, y, z] arrays) ───────────────────────────

export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function vNorm(a) {
  const l = vLen(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

export const clamp = (v, lo, hi) => (Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : lo);
export const clamp01 = (v) => clamp(v, 0, 1);

/** Rodrigues rotation of `v` about unit `axis`. */
export function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = vDot(axis, v) * (1 - c);
  const x = vCross(axis, v);
  return [
    v[0] * c + x[0] * s + axis[0] * k,
    v[1] * c + x[1] * s + axis[1] * k,
    v[2] * c + x[2] * s + axis[2] * k,
  ];
}

/** Re-establish an orthonormal (forward, up) pair after incremental rotation. */
export function orthonormalize(f, u) {
  const fn = vNorm(f);
  const un = vNorm(vSub(u, vScale(fn, vDot(u, fn))));
  return { f: fn, u: un };
}

export const vRight = (f, u) => vNorm(vCross(f, u));

/** Compass heading, degrees, of a forward vector. */
export function headingDeg(f) {
  return ((Math.atan2(f[0], f[1]) * 180) / Math.PI + 360) % 360;
}

export function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// ── Flight model ────────────────────────────────────────────────────────────

/**
 * Fresh flight state in level flight.
 * @param {object} plane
 * @param {number[]} p
 * @param {number} headingRad
 */
export function createFlightState(plane, p, headingRad = 0) {
  return {
    p: [...p],
    f: [Math.sin(headingRad), Math.cos(headingRad), 0],
    u: [0, 0, 1],
    speed: plane.cruise,
    throttle: 0.6,
  };
}

/** Control authority 0..1: fades out between 0.7× and 1.2× stall speed. */
export function controlAuthority(speed, plane) {
  return clamp01((speed - plane.stall * 0.7) / (plane.stall * 0.5));
}

/**
 * Advance one flight step in place.
 *
 * Arcade model: velocity always follows the nose, speed is an energy balance of
 * thrust, quadratic drag and climb/dive, and control authority collapses below
 * stall so the nose drops and speed recovers.
 *
 * @param {object} s - Flight state (mutated).
 * @param {{pitch:number, roll:number, yaw:number, throttle:number, assist?:boolean}} c
 *   pitch > 0 = nose up, roll > 0 = right wing down, yaw > 0 = nose right.
 * @param {object} plane
 * @param {number} dt
 */
export function stepFlight(s, c, plane, dt) {
  const authority = controlAuthority(s.speed, plane);
  const fast = clamp01((s.speed - plane.cruise) / Math.max(1, plane.vmax - plane.cruise));
  const rateScale = authority * (1 - 0.35 * fast);

  s.throttle += clamp(c.throttle - s.throttle, -0.6 * dt, 0.6 * dt);

  let { f, u } = s;
  let r = vRight(f, u);

  let rollCmd = clamp(c.roll, -1, 1);
  if (c.assist && Math.abs(rollCmd) < 0.05 && Math.abs(f[2]) < 0.8) {
    const levelUp = vNorm(vSub([0, 0, 1], vScale(f, f[2])));
    const err = Math.atan2(vDot(r, levelUp), vDot(u, levelUp));
    rollCmd = clamp(err * 1.2, -0.5, 0.5) / Math.max(0.2, authority);
  }

  const pitch = clamp(c.pitch, -1, 1) * plane.pitchRate * rateScale * dt;
  const roll = clamp(rollCmd, -1, 1) * plane.rollRate * rateScale * dt;
  const yaw = clamp(c.yaw, -1, 1) * plane.yawRate * rateScale * dt;
  const stallDrop = (1 - authority) * 0.9 * dt;

  f = rotateAbout(f, r, pitch - stallDrop);
  u = rotateAbout(u, r, pitch - stallDrop);
  r = vRight(f, u);
  u = rotateAbout(u, f, roll);
  f = rotateAbout(f, u, -yaw);
  ({ f, u } = orthonormalize(f, u));
  s.f = f;
  s.u = u;

  const drag = plane.thrust / (plane.vmax * plane.vmax);
  const accel = plane.thrust * s.throttle - drag * s.speed * s.speed - GRAVITY * 0.7 * f[2];
  s.speed = clamp(s.speed + accel * dt, 0, plane.vmax * 1.4);

  s.p[0] += f[0] * s.speed * dt;
  s.p[1] += f[1] * s.speed * dt;
  s.p[2] += f[2] * s.speed * dt - (1 - authority) * 25 * dt;
  if (s.p[2] > ARENA.ceilingM) s.p[2] = ARENA.ceilingM;
  return s;
}

/** Spawn at `home` (arena metres) when given, else on a ring facing the arena centre. */
export function pickSpawn(plane, rand = Math.random, home = null) {
  if (home) {
    let x = home[0] + (rand() - 0.5) * 2000;
    let y = home[1] + (rand() - 0.5) * 2000;
    const max = ARENA.radiusM * 0.9;
    const d = Math.hypot(x, y);
    if (d > max) { x *= max / d; y *= max / d; }
    return createFlightState(plane, [x, y, 900 + rand() * 1200], rand() * TAU);
  }
  const angle = rand() * TAU;
  const dist = ARENA.radiusM * (0.45 + rand() * 0.25);
  const p = [Math.cos(angle) * dist, Math.sin(angle) * dist, 1200 + rand() * 1500];
  const toCentre = Math.atan2(-p[0], -p[1]);
  return createFlightState(plane, p, toCentre + (rand() - 0.5) * 0.5);
}

// ── Geodesy (arena metres ↔ degrees) ────────────────────────────────────────

const R_EARTH = 6_371_000;

export function arenaToLonLat(x, y, anchor = ARENA.anchor) {
  const lat = anchor.lat + (y / R_EARTH) * (180 / Math.PI);
  const lon = anchor.lon
    + (x / (R_EARTH * Math.cos((anchor.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat, lon };
}

/** Inverse of `arenaToLonLat`: degrees → arena metres [x, y]. */
export function lonLatToArena(lat, lon, anchor = ARENA.anchor) {
  return [
    ((lon - anchor.lon) * Math.PI / 180) * R_EARTH * Math.cos((anchor.lat * Math.PI) / 180),
    ((lat - anchor.lat) * Math.PI) / 180 * R_EARTH,
  ];
}

/** Validate an untrusted `{lat, lon}`; returns a clean copy or null. */
export function sanitizePlace(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 80 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// ── Input sanitising (server-side trust boundary, reused by tests) ──────────

export function sanitizeName(raw) {
  const cleaned = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _\-.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NET.nameMax);
  return cleaned;
}

export function resolvePlane(id) {
  return Object.hasOwn(PLANES, id) ? PLANES[id] : null;
}
