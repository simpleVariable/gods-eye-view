import { ARENA, NET, lonLatToArena, sanitizePlace } from '../src/dogfight/shared.js';
import { DogfightRoom } from './dogfightRoom.js';

/** A new player joins an existing room if their place is this close to its centre. */
const JOIN_RADIUS_M = 10_000;
const MAX_ROOMS = 16;

/** Groups players into one arena per region, so "spawn at Tokyo" meets other Tokyo pilots. */
export class DogfightHub {
  constructor({ now, rand, maxRooms = MAX_ROOMS } = {}) {
    this.roomOptions = { now, rand };
    this.maxRooms = maxRooms;
    /** @type {Set<DogfightRoom>} */
    this.rooms = new Set();
  }

  /** Total players across all rooms. */
  get size() {
    let n = 0;
    for (const room of this.rooms) n += room.size;
    return n;
  }

  /**
   * @returns {{room: DogfightRoom, player: object} | {error: string}}
   */
  join(conn, request) {
    const place = sanitizePlace(request?.place) ?? ARENA.anchor;
    let room = [...this.rooms].find((r) => (
      r.size < NET.maxPlayers && Math.hypot(...lonLatToArena(place.lat, place.lon, r.anchor)) <= JOIN_RADIUS_M
    ));
    const created = !room;
    if (created) {
      if (this.rooms.size >= this.maxRooms) return { error: 'All arenas are busy — try again shortly.' };
      room = new DogfightRoom({ ...this.roomOptions, anchor: place });
    }
    const result = room.join(conn, request);
    if (result.error) return result;
    if (created) this.rooms.add(room);
    return { room, player: result.player };
  }

  leave(room, id) {
    room.leave(id);
    if (room.size === 0) this.rooms.delete(room);
  }

  tick() {
    for (const room of this.rooms) room.tick();
  }
}
