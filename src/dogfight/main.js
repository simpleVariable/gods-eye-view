import './dogfight.css';
import {
  ARENA, COMBAT, DEFAULT_PLANE, NET, PLANES,
  clamp, controlAuthority, horizontalDistance, stepFlight,
  vAdd, vDot, vLen, vNorm, vScale, vSub,
} from './shared.js';
import { connect } from './net.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createWorld } from './world.js';

/** Remote aircraft are drawn this far in the past so motion stays smooth. */
const INTERP_MS = 110;
const STATE_INTERVAL_MS = 1000 / NET.clientStateHz;
const LEAD_RANGE_M = 3000;
const LEAD_CONE_COS = Math.cos((25 * Math.PI) / 180);
const STORAGE = { name: 'dogfight.name', plane: 'dogfight.plane' };

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const callsign = $('callsign');
const enterButton = $('enter');
const menuError = $('menu-error');

const hud = createHud();
let selectedPlane = localStorage.getItem(STORAGE.plane);
if (!PLANES[selectedPlane]) selectedPlane = DEFAULT_PLANE;
callsign.value = localStorage.getItem(STORAGE.name) || '';

// ── Menu ────────────────────────────────────────────────────────────────────

function statBar(label, value) {
  const row = document.createElement('div');
  row.className = 'stat';
  const name = document.createElement('span');
  name.textContent = label;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('div');
  fill.style.width = `${Math.round(clamp(value, 0.05, 1) * 100)}%`;
  bar.append(fill);
  row.append(name, bar);
  return row;
}

function renderPlaneCards() {
  const all = Object.values(PLANES);
  const maxFirepower = Math.max(...all.map((p) => p.damage * p.fireRate));
  const grid = $('planes');
  grid.replaceChildren(...all.map((plane) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'plane';
    card.setAttribute('aria-pressed', String(plane.id === selectedPlane));
    const title = document.createElement('b');
    title.textContent = plane.name;
    const role = document.createElement('em');
    role.textContent = plane.role;
    card.append(
      title, role,
      statBar('SPD', plane.vmax / 220),
      statBar('AGL', (plane.rollRate / 2.8 + plane.pitchRate / 1.5) / 2),
      statBar('ARM', (plane.hp / 400) ** 0.6),
      statBar('GUN', (plane.damage * plane.fireRate) / maxFirepower),
    );
    card.addEventListener('click', () => {
      selectedPlane = plane.id;
      localStorage.setItem(STORAGE.plane, plane.id);
      for (const c of grid.children) c.setAttribute('aria-pressed', String(c === card));
    });
    return card;
  }));
}
renderPlaneCards();

// ── Game state ──────────────────────────────────────────────────────────────

let phase = 'menu'; // menu | joining | playing
let net = null;
let world = null;
let camMode = 'chase';
let board = [];
let pingMs = 0;
let lastFrame = performance.now();
let lastSend = 0;
let sentFire = false;
let wasBoardKey = false;

const me = {
  id: 0, plane: null, visual: null,
  alive: false, frozen: false, flight: null,
  hp: 0, ammo: COMBAT.ammoMax, kills: 0, deaths: 0,
  protectedUntil: 0, respawnAt: 0, oobSince: 0,
};
/** @type {Map<number, object>} */
const remotes = new Map();

const input = createInput({
  onCamera() {
    camMode = camMode === 'chase' ? 'cockpit' : 'chase';
  },
});

function showMenuError(text) {
  menuError.textContent = text;
  enterButton.disabled = false;
  phase = 'menu';
}

function enter() {
  const name = callsign.value.trim();
  if (!name) { showMenuError('Enter a callsign first.'); callsign.focus(); return; }
  if (!world) { showMenuError('The 3D engine is still loading — one moment.'); return; }
  localStorage.setItem(STORAGE.name, name);
  menuError.textContent = '';
  enterButton.disabled = true;
  phase = 'joining';
  net = connect({
    name,
    plane: selectedPlane,
    onMessage: onMessage,
    onClose(opened) {
      if (phase === 'playing') $('offline').hidden = false;
      else showMenuError(opened ? 'Join was rejected.' : 'Could not reach the game server.');
    },
  });
}
enterButton.addEventListener('click', enter);
callsign.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
$('reload').addEventListener('click', () => location.reload());

// ── Network messages ────────────────────────────────────────────────────────

function applyFlight(s) {
  me.flight = { p: [...s.p], f: [...s.f], u: [...s.u], speed: s.v, throttle: s.th };
  input.setThrottle(s.th);
}

function revive(s) {
  applyFlight(s);
  me.hp = s.hp;
  me.ammo = COMBAT.ammoMax;
  me.alive = true;
  me.frozen = false;
  me.oobSince = 0;
  me.protectedUntil = performance.now() + s.protectMs;
  sentFire = false;
  world.enterGameCamera();
  hud.hideDeath();
}

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      me.id = msg.id;
      me.plane = PLANES[msg.plane];
      me.visual?.destroy();
      me.visual = world.createPlaneVisual(me.plane);
      revive(msg.spawn);
      menu.hidden = true;
      hud.show(true);
      input.setEnabled(true);
      phase = 'playing';
      hud.feed(`Welcome, ${msg.name}`, 'sys');
      setInterval(() => net.send({ t: 'ping', c: performance.now() }), 2000);
      break;
    case 'spawn': revive(msg); break;
    case 'sync': applyFlight(msg); me.frozen = false; break;
    case 'snap': onSnapshot(msg); break;
    case 'pong': pingMs = Math.round(performance.now() - msg.c); break;
    case 'err':
      if (phase === 'playing') hud.feed(msg.msg, 'sys');
      else showMenuError(msg.msg);
      break;
    default: break;
  }
}

function onSnapshot(msg) {
  const now = performance.now();
  board = msg.players;
  const seen = new Set();

  for (const p of msg.players) {
    if (p.id === me.id) {
      me.kills = p.k; me.deaths = p.d; me.hp = p.hp; me.ammo = p.am;
      continue;
    }
    seen.add(p.id);
    let r = remotes.get(p.id);
    if (!r) {
      const plane = PLANES[p.pl];
      if (!plane) continue;
      r = { id: p.id, name: p.n, plane, visual: world.createPlaneVisual(plane, { id: p.id, tint: true }), buf: [], alive: false, hp: p.hp };
      remotes.set(p.id, r);
    }
    if (p.a && !r.alive) r.buf.length = 0;
    r.alive = !!p.a;
    r.hp = p.hp;
    if (r.alive) {
      r.buf.push({ t: now, p: p.p, f: p.f, u: p.u, v: p.v });
      if (r.buf.length > 8) r.buf.shift();
    }
  }
  for (const [id, r] of remotes) {
    if (!seen.has(id)) { r.visual.destroy(); remotes.delete(id); }
  }

  for (const s of msg.shots) world.addTracer(s.o, s.v, now);
  for (const e of msg.ev) onEvent(e);
  hud.board(board, me.id, pingMs, input.state.board);
}

function onEvent(e) {
  if (e.e === 'hit') {
    world.spark(e.p);
    if (e.id === me.id) { me.hp = e.hp; hud.flashDamage(); }
    if (e.by === me.id) hud.hitMarker();
  } else if (e.e === 'kill') {
    world.explosion(e.p);
    const r = remotes.get(e.id);
    if (r) { r.alive = false; r.visual.setVisible(false); }
    const mine = e.id === me.id || e.by === me.id;
    hud.feed(e.by ? `${e.bn} ▸ ${e.n}` : `${e.n} ${e.why}`, mine ? 'mine' : '');
    if (e.id === me.id) die(e);
  } else if (e.e === 'join') {
    hud.feed(`${e.n} joined in ${PLANES[e.pl]?.name ?? e.pl}`, 'sys');
  } else if (e.e === 'leave') {
    hud.feed(`${e.n} left`, 'sys');
  }
}

function die(e) {
  me.alive = false;
  me.frozen = false;
  sentFire = false;
  me.respawnAt = performance.now() + COMBAT.respawnMs;
  me.visual.setVisible(false);
  hud.showDeath(e.by ? 'SHOT DOWN' : e.why.toUpperCase(), e.by ? `by ${e.bn}` : '');
}

// ── Per-frame ───────────────────────────────────────────────────────────────

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r1 = (v) => Math.round(v * 10) / 10;

function sendState() {
  const f = me.flight;
  net.send({ t: 's', p: f.p.map(r1), f: f.f.map(r4), u: f.u.map(r4), v: r1(f.speed) });
}

/** Position of a remote aircraft at `now − INTERP_MS`, blended from buffered snapshots. */
function sampleRemote(r, now) {
  const b = r.buf;
  if (!b.length) return null;
  const t = now - INTERP_MS;
  const last = b[b.length - 1];
  if (t >= last.t) {
    const s = Math.min((t - last.t) / 1000, 0.25);
    return { p: vAdd(last.p, vScale(last.f, last.v * s)), f: last.f, u: last.u, v: last.v };
  }
  let i = b.findIndex((x) => x.t > t);
  if (i <= 0) i = 1;
  if (i >= b.length) return last;
  const a = b[i - 1];
  const c = b[i];
  const k = clamp((t - a.t) / Math.max(1, c.t - a.t), 0, 1);
  const mix = (x, y) => vAdd(vScale(x, 1 - k), vScale(y, k));
  return { p: mix(a.p, c.p), f: vNorm(mix(a.f, c.f)), u: vNorm(mix(a.u, c.u)), v: a.v + (c.v - a.v) * k };
}

/** Where to aim so a bullet fired now meets the target, or null if unreachable. */
function leadPoint(me, target) {
  const d = vSub(target.p, me.flight.p);
  const vr = vSub(vScale(target.f, target.v), vScale(me.flight.f, me.flight.speed));
  const W = COMBAT.bulletSpeedMps;
  const a = vDot(vr, vr) - W * W;
  const b = 2 * vDot(d, vr);
  const c = vDot(d, d);
  let t;
  if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : -1;
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const roots = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((x) => x > 0);
    t = roots.length ? Math.min(...roots) : -1;
  }
  if (!(t > 0) || t > COMBAT.bulletLifeS) return null;
  return vAdd(me.flight.p, vAdd(d, vScale(vr, t)));
}

function buildAlerts(now) {
  const alerts = [];
  if (!me.alive) return alerts;
  const { flight } = me;
  if (me.frozen) return alerts;
  if (controlAuthority(flight.speed, me.plane) < 0.95) {
    alerts.push({ text: 'STALL — NOSE DOWN', bad: true });
  }
  const sink = -flight.f[2] * flight.speed;
  if (sink > 5 && flight.p[2] / sink < 4.5) alerts.push({ text: 'PULL UP', bad: true });
  if (me.oobSince) {
    const left = Math.max(0, Math.ceil(ARENA.outOfBoundsGraceS - (now - me.oobSince) / 1000));
    alerts.push({ text: `LEAVING COMBAT ZONE — TURN BACK ${left}`, bad: true });
  }
  if (now < me.protectedUntil) alerts.push({ text: 'SPAWN SHIELD' });
  if (me.ammo < 1) alerts.push({ text: 'GUNS COOLING' });
  return alerts;
}

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (phase !== 'playing') {
    world.menuCamera(now / 1000);
    return;
  }

  input.update(dt);
  const c = input.state;
  if (c.board !== wasBoardKey) {
    wasBoardKey = c.board;
    hud.board(board, me.id, pingMs, c.board);
  }

  const flying = me.alive && !me.frozen;
  if (flying) {
    stepFlight(me.flight, { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, assist: c.assist }, me.plane, dt);
    if (me.flight.p[2] <= 0) {
      me.frozen = true;
      sendState();
    }
    if (horizontalDistance(me.flight.p, [0, 0, 0]) > ARENA.radiusM) me.oobSince ||= now;
    else me.oobSince = 0;
  }

  const wantFire = me.alive && !me.frozen && c.fire;
  if (wantFire !== sentFire) {
    net.send({ t: 'fire', on: wantFire });
    sentFire = wantFire;
  }
  if (flying && now - lastSend >= STATE_INTERVAL_MS) {
    lastSend = now;
    sendState();
  }

  const f = me.flight;
  me.visual.setVisible(me.alive && camMode === 'chase');
  if (me.alive) me.visual.update(f.p, f.f, f.u);
  if (me.alive || camMode === 'cockpit') world.followCamera(f, me.plane, camMode, dt);

  const others = [];
  const tagItems = [];
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    const s = sampleRemote(r, now);
    if (!s) continue;
    r.render = s;
    r.visual.setVisible(true);
    r.visual.update(s.p, s.f, s.u);
    others.push({ r, p: s.p });
    const dist = vLen(vSub(s.p, f.p));
    if (me.alive && dist < 12000) {
      tagItems.push({ id: r.id, name: r.name, hpFrac: r.hp / r.plane.hp, dist, point: world.project(s.p) });
    }
  }
  hud.tags(tagItems);

  let target = null;
  if (me.alive) {
    let bestCos = LEAD_CONE_COS;
    for (const { r } of others) {
      const d = vSub(r.render.p, f.p);
      const range = vLen(d);
      if (range > LEAD_RANGE_M || range < 1) continue;
      const cos = vDot(vScale(d, 1 / range), f.f);
      if (cos > bestCos) { bestCos = cos; target = r; }
    }
  }
  const lead = target ? leadPoint(me, target.render) : null;
  hud.sights({
    lead: lead ? world.project(lead) : null,
    lock: target ? world.project(target.render.p) : null,
  });

  world.updateEffects(dt, now);
  hud.flight({ me, plane: me.plane, assist: c.assist, alerts: buildAlerts(now) });
  hud.radarFrame(me, others.map((o) => ({ p: o.p })));
  if (!me.alive) hud.deathCountdown(Math.max(0, Math.ceil((me.respawnAt - now) / 1000)));
}

// ── Boot ────────────────────────────────────────────────────────────────────

createWorld($('world'), $('credits')).then((w) => {
  world = w;
  world.viewer.scene.preRender.addEventListener(frame);
}).catch((error) => {
  console.error('[dogfight] engine failed to start', error);
  showMenuError('Your browser could not start the 3D engine (WebGL required).');
  enterButton.disabled = true;
});
