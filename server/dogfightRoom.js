/**
 * Dogfight game room — transport-agnostic and authoritative for combat.
 *
 * Clients fly their own aircraft and report state; the server bounds-checks that
 * state, fires the guns, steps the bullets, and decides every hit, kill and
 * respawn. A "connection" is anything with `send(object)`.
 */
import {
  ARENA, COMBAT, DEFAULT_PLANE, NET, PLANES,
  clamp, horizontalDistance, lonLatToArena, orthonormalize, pickSpawn, resolvePlane, sanitizeName,
  sanitizePlace,
  vAdd, vCross, vDot, vLen, vNorm, vScale, vSub,
} from '../src/dogfight/shared.js';

/** Newest client state is extrapolated this far at most when testing hits. */
const MAX_EXTRAPOLATION_S = 0.15;
const KICK_VIOLATIONS = 40;

const round = (n, d = 1) => {
  const k = 10 ** d;
  return Math.round(n * k) / k;
};
const roundVec = (v, d = 1) => [round(v[0], d), round(v[1], d), round(v[2], d)];
const isVec3 = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => Number.isFinite(n));

/** Closest approach of segment a→b to point c, squared. */
function segmentPointDistSq(a, b, c) {
  const ab = vSub(b, a);
  const len2 = vDot(ab, ab);
  const t = len2 > 0 ? clamp(vDot(vSub(c, a), ab) / len2, 0, 1) : 0;
  const q = vAdd(a, vScale(ab, t));
  const d = vSub(c, q);
  return vDot(d, d);
}

export class DogfightRoom {
  /**
   * @param {{now?: () => number, rand?: () => number, anchor?: {lat: number, lon: number}}} [options]
   */
  constructor({ now = Date.now, rand = Math.random, anchor = ARENA.anchor } = {}) {
    this.now = now;
    this.rand = rand;
    this.anchor = anchor;
    /** @type {Map<number, object>} */
    this.players = new Map();
    this.bullets = [];
    this.events = [];
    this.pendingShots = [];
    this.nextPlayerId = 1;
    this.nextBulletId = 1;
    this.lastTick = now();
    this.tickCount = 0;
  }

  get size() {
    return this.players.size;
  }

  /**
   * Admit a player. Returns `{player}` or `{error}`.
   * @param {{send: (msg: object) => void}} conn
   * @param {{name?: unknown, plane?: unknown}} request
   */
  join(conn, request) {
    if (this.players.size >= NET.maxPlayers) return { error: 'Arena is full — try again shortly.' };
    const base = sanitizeName(request?.name);
    if (!base) return { error: 'Enter a callsign (letters, numbers, spaces).' };
    const plane = request?.plane == null ? PLANES[DEFAULT_PLANE] : resolvePlane(request.plane);
    if (!plane) return { error: 'Unknown aircraft type.' };

    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
      const suffix = `_${n}`;
      name = base.slice(0, NET.nameMax - suffix.length) + suffix;
    }

    const now = this.now();
    const place = sanitizePlace(request?.place);
    const player = {
      id: this.nextPlayerId++,
      name,
      plane,
      home: place ? lonLatToArena(place.lat, place.lon, this.anchor) : null,
      send: (msg) => conn.send(msg),
      kills: 0,
      deaths: 0,
      firing: false,
      nextShotAt: 0,
      violations: 0,
      oobSince: 0,
      respawnAt: 0,
      lastStateAt: now,
    };
    this.#spawn(player, now);
    this.players.set(player.id, player);

    player.send({
      t: 'welcome',
      id: player.id,
      name,
      plane: plane.id,
      serverTime: now,
      anchor: this.anchor,
      spawn: this.#spawnPayload(player),
    });
    this.events.push({ e: 'join', n: name, pl: plane.id });
    return { player };
  }

  leave(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.events.push({ e: 'leave', n: player.name });
  }

  /** Handle one parsed client message. */
  handle(id, msg) {
    const player = this.players.get(id);
    if (!player || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 's': this.#applyState(player, msg); break;
      case 'fire': player.firing = msg.on === true; break;
      case 'ping': player.send({ t: 'pong', c: Number(msg.c) || 0 }); break;
      default: break;
    }
  }

  #spawn(player, now) {
    const s = pickSpawn(player.plane, this.rand, player.home);
    player.p = s.p;
    player.f = s.f;
    player.u = s.u;
    player.speed = s.speed;
    player.throttle = s.throttle;
    player.hp = player.plane.hp;
    player.ammo = COMBAT.ammoMax;
    player.empty = false;
    player.alive = true;
    player.firing = false;
    player.oobSince = 0;
    player.lastStateAt = now;
    player.protectedUntil = now + COMBAT.spawnProtectMs;
  }

  #spawnPayload(player) {
    return {
      p: roundVec(player.p), f: roundVec(player.f, 4), u: roundVec(player.u, 4),
      v: round(player.speed), th: player.throttle, hp: player.hp,
      protectMs: COMBAT.spawnProtectMs,
    };
  }

  #applyState(player, msg) {
    if (!player.alive) return;
    if (!isVec3(msg.p) || !isVec3(msg.f) || !isVec3(msg.u) || !Number.isFinite(msg.v)) return;
    if (vLen(msg.f) < 0.5 || vLen(msg.u) < 0.5) return;

    const now = this.now();
    const dt = clamp((now - player.lastStateAt) / 1000, 0.01, 1);
    const plane = player.plane;
    const moved = vLen(vSub(msg.p, player.p));
    if (moved > plane.vmax * 1.6 * dt + 40) {
      player.violations += 1;
      if (player.violations > KICK_VIOLATIONS) {
        player.send({ t: 'err', msg: 'Disconnected: invalid flight data.' });
        player.kick?.();
        return;
      }
      player.send({ t: 'sync', ...this.#spawnPayload(player) });
      return;
    }
    player.violations = Math.max(0, player.violations - 0.05);

    const { f, u } = orthonormalize(msg.f, msg.u);
    player.p = [msg.p[0], msg.p[1], clamp(msg.p[2], -50, ARENA.ceilingM + 200)];
    player.f = f;
    player.u = u;
    player.speed = clamp(msg.v, 0, plane.vmax * 1.45);
    player.lastStateAt = now;
  }

  #positionAt(player, now) {
    const age = Math.min((now - player.lastStateAt) / 1000, MAX_EXTRAPOLATION_S);
    return vAdd(player.p, vScale(player.f, player.speed * age));
  }

  #fireGuns(player, now) {
    const plane = player.plane;
    const interval = 1000 / plane.fireRate;
    let shots = 0;
    if (now - player.nextShotAt > interval * 2) player.nextShotAt = now;
    while (player.firing && !player.empty && now >= player.nextShotAt && shots < 2) {
      player.nextShotAt += interval;
      player.ammo -= 1;
      shots += 1;

      const origin = vAdd(this.#positionAt(player, now), vScale(player.f, COMBAT.muzzleOffsetM));
      const right = vNorm(vCross(player.f, player.u));
      const jx = (this.rand() - 0.5) * 2 * COMBAT.spreadRad;
      const jy = (this.rand() - 0.5) * 2 * COMBAT.spreadRad;
      const dir = vNorm(vAdd(player.f, vAdd(vScale(right, jx), vScale(player.u, jy))));
      const v = vScale(dir, COMBAT.bulletSpeedMps + player.speed);
      const bullet = { id: this.nextBulletId++, by: player.id, p: origin, v, bornAt: now };
      this.bullets.push(bullet);
      this.pendingShots.push({ b: bullet.id, by: player.id, o: roundVec(origin), v: roundVec(v) });
      if (player.ammo < 1) player.empty = true;
    }
  }

  #kill(victim, killer, why, now) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.firing = false;
    victim.deaths += 1;
    victim.respawnAt = now + COMBAT.respawnMs;
    if (killer && killer !== victim) killer.kills += 1;
    this.events.push({
      e: 'kill', id: victim.id, n: victim.name, by: killer && killer !== victim ? killer.id : 0,
      bn: killer && killer !== victim ? killer.name : '', why, p: roundVec(victim.p),
    });
  }

  #stepBullets(dt, now) {
    const live = [];
    for (const b of this.bullets) {
      const a = b.p;
      const next = vAdd(a, vScale(b.v, dt));
      let consumed = false;
      for (const target of this.players.values()) {
        if (!target.alive || target.id === b.by) continue;
        const centre = this.#positionAt(target, now);
        const r = target.plane.hitRadiusM;
        if (segmentPointDistSq(a, next, centre) > r * r) continue;
        consumed = true;
        if (now >= target.protectedUntil) {
          const shooter = this.players.get(b.by);
          const dmg = shooter ? shooter.plane.damage : 5;
          target.hp = Math.max(0, target.hp - dmg);
          this.events.push({ e: 'hit', id: target.id, by: b.by, hp: target.hp, p: roundVec(centre) });
          if (target.hp <= 0) this.#kill(target, shooter, 'shot down', now);
        }
        break;
      }
      b.p = next;
      if (!consumed && next[2] > 0 && now - b.bornAt < COMBAT.bulletLifeS * 1000) live.push(b);
    }
    this.bullets = live;
  }

  /** Advance the simulation to the current clock. */
  tick() {
    const now = this.now();
    const dt = Math.min(Math.max((now - this.lastTick) / 1000, 0), 0.1);
    this.lastTick = now;
    this.tickCount += 1;

    for (const player of this.players.values()) {
      if (player.alive) {
        player.ammo = Math.min(COMBAT.ammoMax, player.ammo + COMBAT.ammoRegenPerS * dt);
        if (player.ammo >= COMBAT.ammoRearm) player.empty = false;
        this.#fireGuns(player, now);

        const pos = this.#positionAt(player, now);
        if (pos[2] <= 0) this.#kill(player, null, 'crashed', now);
        else if (horizontalDistance(pos, [0, 0, 0]) > ARENA.radiusM) {
          player.oobSince ||= now;
          if (now - player.oobSince > ARENA.outOfBoundsGraceS * 1000) {
            this.#kill(player, null, 'left the combat zone', now);
          }
        } else {
          player.oobSince = 0;
        }
      } else if (now >= player.respawnAt) {
        this.#spawn(player, now);
        player.send({ t: 'spawn', ...this.#spawnPayload(player) });
      }
    }

    this.#stepBullets(dt, now);

    if (this.tickCount % Math.round(NET.tickHz / NET.snapshotHz) === 0) this.#broadcastSnapshot(now);
  }

  #broadcastSnapshot(now) {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, n: p.name, pl: p.plane.id, a: p.alive ? 1 : 0,
        p: roundVec(p.p), f: roundVec(p.f, 3), u: roundVec(p.u, 3), v: round(p.speed),
        hp: Math.round(p.hp), k: p.kills, d: p.deaths, fr: p.firing ? 1 : 0,
        pr: now < p.protectedUntil ? 1 : 0, am: Math.floor(p.ammo),
        ob: p.oobSince ? Math.max(0, Math.ceil(ARENA.outOfBoundsGraceS - (now - p.oobSince) / 1000)) : 0,
      });
    }
    const msg = { t: 'snap', ts: now, players, shots: this.pendingShots, ev: this.events };
    this.pendingShots = [];
    this.events = [];
    for (const p of this.players.values()) p.send(msg);
  }
}
