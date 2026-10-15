import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import {
  ARENA, COMBAT, NET, PLANES,
  controlAuthority, createFlightState, lonLatToArena, sanitizeName, sanitizePlace, stepFlight,
  vCross, vDot, vLen,
} from './shared.js';
import { DogfightRoom } from '../../server/dogfightRoom.js';
import { DogfightHub } from '../../server/dogfightHub.js';
import { attachDogfight } from '../../server/dogfightPlugin.js';

const plane = PLANES.citation2;
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };

function fakeClock() {
  const clock = { t: 1_000_000, now: () => clock.t };
  return clock;
}

function makeConn() {
  const msgs = [];
  return { msgs, send: (m) => msgs.push(m) };
}

function setup() {
  const clock = fakeClock();
  const room = new DogfightRoom({ now: clock.now, rand: () => 0.5 });
  return { clock, room };
}

function place(player, p, f = [0, 1, 0]) {
  player.p = p;
  player.f = f;
  player.u = [0, 0, 1];
  player.speed = 0;
  // Far-future timestamp keeps the stationary test aircraft from being extrapolated.
  player.lastStateAt = 1e15;
  player.protectedUntil = 0;
}

function run(room, clock, ticks) {
  for (let i = 0; i < ticks; i += 1) {
    clock.t += 1000 / NET.tickHz;
    room.tick();
  }
}

test('flight model keeps an orthonormal frame and bounded speed under hard manoeuvres', () => {
  const s = createFlightState(plane, [0, 0, 2000], 0);
  for (let i = 0; i < 3000; i += 1) {
    const phase = i / 60;
    stepFlight(s, {
      pitch: Math.sin(phase), roll: Math.cos(phase * 1.3), yaw: Math.sin(phase * 0.7), throttle: 1,
    }, plane, 1 / 60);
    s.p[2] = Math.max(s.p[2], 500);
  }
  assert.ok(Math.abs(vLen(s.f) - 1) < 1e-6);
  assert.ok(Math.abs(vLen(s.u) - 1) < 1e-6);
  assert.ok(Math.abs(vDot(s.f, s.u)) < 1e-6);
  assert.ok(s.speed >= 0 && s.speed <= plane.vmax * 1.4);
  assert.ok(vLen(vCross(s.f, s.u)) > 0.999);
});

test('pulling back raises the nose and rolling right banks the up vector right', () => {
  const up = createFlightState(plane, [0, 0, 2000], 0);
  stepFlight(up, { ...neutral, pitch: 1 }, plane, 0.5);
  assert.ok(up.f[2] > 0.05);

  const bank = createFlightState(plane, [0, 0, 2000], 0); // heading north, right = east
  stepFlight(bank, { ...neutral, roll: 1 }, plane, 0.5);
  assert.ok(bank.u[0] > 0.05);
});

test('below stall speed control collapses and the nose drops', () => {
  const s = createFlightState(plane, [0, 0, 3000], 0);
  s.speed = plane.stall * 0.5;
  assert.equal(controlAuthority(s.speed, plane), 0);
  stepFlight(s, { ...neutral, pitch: 1 }, plane, 1);
  assert.ok(s.f[2] < 0);
});

test('callsigns are stripped to safe characters and length', () => {
  assert.equal(sanitizeName('  Ace<script>!! '), 'Acescript');
  assert.equal(sanitizeName('x'.repeat(40)).length, NET.nameMax);
  assert.equal(sanitizeName('<>'), '');
});

test('join validates callsign and aircraft, and de-duplicates names', () => {
  const { room } = setup();
  assert.ok(room.join(makeConn(), { name: '   ', plane: 'jet' }).error);
  assert.ok(room.join(makeConn(), { name: 'Ace', plane: 'x-wing' }).error);
  assert.ok(room.join(makeConn(), { name: 'Ace', plane: '__proto__' }).error);

  const first = room.join(makeConn(), { name: 'Ace', plane: 'jet' });
  const second = room.join(makeConn(), { name: 'ace', plane: 'c172' });
  assert.equal(first.player.name, 'Ace');
  assert.equal(second.player.name, 'ace_2');
});

test('arena refuses players beyond capacity', () => {
  const { room } = setup();
  for (let i = 0; i < NET.maxPlayers; i += 1) {
    assert.ok(room.join(makeConn(), { name: `P${i}`, plane: 'jet' }).player);
  }
  assert.match(room.join(makeConn(), { name: 'Late', plane: 'jet' }).error, /full/i);
});

test('impossible position jumps are rejected and the client is re-synced', () => {
  const { room, clock } = setup();
  const conn = makeConn();
  const { player } = room.join(conn, { name: 'Ace', plane: 'jet' });
  const before = [...player.p];
  clock.t += 50;
  room.handle(player.id, { t: 's', p: [before[0] + 50_000, before[1], before[2]], f: [0, 1, 0], u: [0, 0, 1], v: 100 });
  assert.deepEqual(player.p, before);
  assert.equal(conn.msgs.at(-1).t, 'sync');

  clock.t += 50;
  room.handle(player.id, { t: 's', p: [before[0] + 5, before[1], before[2]], f: [0, 1, 0], u: [0, 0, 1], v: 100 });
  assert.equal(player.p[0], before[0] + 5);
});

test('malformed state is ignored', () => {
  const { room } = setup();
  const { player } = room.join(makeConn(), { name: 'Ace', plane: 'jet' });
  const before = [...player.p];
  room.handle(player.id, { t: 's', p: ['a', 0, 0], f: [0, 1, 0], u: [0, 0, 1], v: 1 });
  room.handle(player.id, { t: 's', p: [0, 0, NaN], f: [0, 1, 0], u: [0, 0, 1], v: 1 });
  room.handle(player.id, { t: 's', p: [0, 0, 0], f: [0, 0, 0], u: [0, 0, 1], v: 1 });
  assert.deepEqual(player.p, before);
});

test('sustained gunfire destroys the target, credits the shooter and respawns the victim', () => {
  const { room, clock } = setup();
  const aConn = makeConn();
  const bConn = makeConn();
  const a = room.join(aConn, { name: 'Hunter', plane: 'citation2' }).player;
  const b = room.join(bConn, { name: 'Prey', plane: 'citation2' }).player;
  place(a, [0, 0, 1500]);
  place(b, [0, 400, 1500]);

  room.handle(a.id, { t: 'fire', on: true });
  run(room, clock, 240);

  const events = aConn.msgs.flatMap((m) => m.ev ?? []);
  const kill = events.find((e) => e.e === 'kill');
  assert.ok(kill, 'a kill event is broadcast');
  assert.equal(kill.id, b.id);
  assert.equal(kill.by, a.id);
  assert.equal(a.kills, 1);
  assert.equal(b.deaths, 1);
  assert.ok(events.some((e) => e.e === 'hit'));
  assert.ok(aConn.msgs.some((m) => (m.shots ?? []).length > 0));

  room.handle(a.id, { t: 'fire', on: false });
  run(room, clock, Math.ceil((COMBAT.respawnMs / 1000) * NET.tickHz) + 5);
  assert.ok(b.alive);
  assert.equal(b.hp, PLANES.citation2.hp);
  assert.ok(bConn.msgs.some((m) => m.t === 'spawn'));
});

test('spawn shield blocks damage', () => {
  const { room, clock } = setup();
  const a = room.join(makeConn(), { name: 'Hunter', plane: 'citation2' }).player;
  const b = room.join(makeConn(), { name: 'Prey', plane: 'citation2' }).player;
  place(a, [0, 0, 1500]);
  place(b, [0, 400, 1500]);
  b.protectedUntil = Infinity;
  room.handle(a.id, { t: 'fire', on: true });
  run(room, clock, 90);
  assert.equal(b.hp, PLANES.citation2.hp);
});

test('ground contact and leaving the arena are fatal without crediting anyone', () => {
  const { room, clock } = setup();
  const conn = makeConn();
  const a = room.join(conn, { name: 'Low', plane: 'jet' }).player;
  const b = room.join(makeConn(), { name: 'Wide', plane: 'jet' }).player;
  place(a, [0, 0, -2]);
  place(b, [ARENA.radiusM + 2000, 0, 1500]);
  run(room, clock, 3);
  assert.equal(a.alive, false);

  run(room, clock, Math.ceil((ARENA.outOfBoundsGraceS + 1) * NET.tickHz));
  const kills = conn.msgs.flatMap((m) => m.ev ?? []).filter((e) => e.e === 'kill');
  assert.ok(kills.find((k) => k.why === 'crashed'));
  assert.ok(kills.find((k) => k.why === 'left the combat zone'));
  assert.ok(kills.every((k) => k.by === 0));
});

test('hub groups nearby places into one arena and spawns pilots at their place', () => {
  const hub = new DogfightHub({ rand: () => 0.5 });
  const tokyo = { lat: 35.68, lon: 139.76 };
  const near = { lat: 35.70, lon: 139.78 };
  const paris = { lat: 48.85, lon: 2.35 };

  const a = hub.join(makeConn(), { name: 'A', plane: 'jet', place: tokyo });
  const b = hub.join(makeConn(), { name: 'B', plane: 'jet', place: near });
  const c = hub.join(makeConn(), { name: 'C', plane: 'jet', place: paris });
  assert.equal(a.room, b.room);
  assert.notEqual(a.room, c.room);
  assert.equal(hub.rooms.size, 2);

  const [hx, hy] = lonLatToArena(near.lat, near.lon, a.room.anchor);
  assert.ok(Math.abs(b.player.p[0] - hx) < 1);
  assert.ok(Math.abs(b.player.p[1] - hy) < 1);

  hub.leave(c.room, c.player.id);
  assert.equal(hub.rooms.size, 1);
});

test('hub ignores invalid places and caps the number of arenas', () => {
  assert.equal(sanitizePlace({ lat: 'x', lon: 3 }), null);
  assert.equal(sanitizePlace({ lat: 95, lon: 3 }), null);
  assert.deepEqual(sanitizePlace({ lat: '10', lon: '20' }), { lat: 10, lon: 20 });

  const hub = new DogfightHub({ maxRooms: 1 });
  assert.ok(hub.join(makeConn(), { name: 'A', plane: 'jet', place: { lat: 999, lon: 0 } }).player);
  assert.match(hub.join(makeConn(), { name: 'B', plane: 'jet', place: { lat: 10, lon: 10 } }).error, /busy/i);
});

test('websocket transport: join handshake, snapshots and rejection of a blank callsign', async () => {
  const http = createServer();
  const dispose = attachDogfight(http, new DogfightHub());
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address();
  const url = `ws://127.0.0.1:${port}${NET.path}`;

  const nextMessage = (ws, type) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 3000);
    ws.on('message', function onMsg(data) {
      const msg = JSON.parse(data.toString());
      if (msg.t === type) { clearTimeout(timer); ws.off('message', onMsg); resolve(msg); }
    });
  });

  try {
    const ok = new WebSocket(url);
    await new Promise((resolve) => ok.on('open', resolve));
    const welcome = nextMessage(ok, 'welcome');
    ok.send(JSON.stringify({ t: 'join', name: 'Tester', plane: 'jet' }));
    const w = await welcome;
    assert.equal(w.name, 'Tester');
    const snap = await nextMessage(ok, 'snap');
    assert.equal(snap.players.length, 1);

    const bad = new WebSocket(url);
    await new Promise((resolve) => bad.on('open', resolve));
    const err = nextMessage(bad, 'err');
    bad.send(JSON.stringify({ t: 'join', name: '', plane: 'jet' }));
    assert.ok((await err).msg);

    ok.close();
    bad.close();
  } finally {
    dispose();
    await new Promise((resolve) => http.close(resolve));
  }
});
