import { WebSocketServer } from 'ws';
import { NET } from '../src/dogfight/shared.js';
import { DogfightHub } from './dogfightHub.js';

const MAX_PAYLOAD_BYTES = 2048;
const MAX_CONNECTIONS_PER_IP = 4;
const RATE_BURST = 120;
const RATE_PER_S = 80;

function clientIp(req) {
  const trusted = process.env.GEV_TRUST_PROXY === '1';
  const forwarded = trusted ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}

/** Reject cross-site upgrades: the page and the socket must share a host. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Attach the dogfight hub to an http server at `NET.path`.
 * Returns a disposer that stops the timer and closes every socket.
 */
export function attachDogfight(httpServer, hub = new DogfightHub()) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const perIp = new Map();
  let timer = null;

  const ensureTimer = () => {
    if (timer) return;
    timer = setInterval(() => hub.tick(), Math.round(1000 / NET.tickHz));
    timer.unref?.();
  };
  const maybeStopTimer = () => {
    if (hub.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const onUpgrade = (req, socket, head) => {
    const pathname = String(req.url || '').split('?')[0];
    if (pathname !== NET.path) return;
    const ip = clientIp(req);
    if (!sameOrigin(req) || (perIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  };

  const onConnection = (ws, ip) => {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    let player = null;
    let room = null;
    let tokens = RATE_BURST;
    let refilled = Date.now();

    const conn = {
      send(msg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      tokens = Math.min(RATE_BURST, tokens + ((now - refilled) / 1000) * RATE_PER_S);
      refilled = now;
      if (tokens < 1) return;
      tokens -= 1;

      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (!player) {
        if (msg.t !== 'join') return;
        const result = hub.join(conn, msg);
        if (result.error) {
          conn.send({ t: 'err', msg: result.error });
          ws.close(1008, 'join rejected');
          return;
        }
        ({ player, room } = result);
        player.kick = () => ws.close(1008, 'invalid data');
        ensureTimer();
        return;
      }
      room.handle(player.id, msg);
    });

    ws.on('close', () => {
      const left = (perIp.get(ip) || 1) - 1;
      if (left > 0) perIp.set(ip, left); else perIp.delete(ip);
      if (player) hub.leave(room, player.id);
      maybeStopTimer();
    });
    ws.on('error', () => ws.terminate());
  };

  httpServer.on('upgrade', onUpgrade);
  return () => {
    httpServer.off('upgrade', onUpgrade);
    if (timer) clearInterval(timer);
    for (const client of wss.clients) client.terminate();
    wss.close();
  };
}

/** Vite plugin: `/dogfight` page alias plus the WebSocket game server. */
export function dogfightPlugin() {
  const install = (server) => {
    server.middlewares.use((req, _res, next) => {
      const [path, query] = String(req.url || '').split('?');
      if (path === '/dogfight' || path === '/dogfight/') {
        req.url = `/dogfight.html${query ? `?${query}` : ''}`;
      }
      next();
    });
    if (server.httpServer) {
      const dispose = attachDogfight(server.httpServer);
      server.httpServer.once('close', dispose);
    }
  };
  return {
    name: 'dogfight',
    configureServer: install,
    configurePreviewServer: install,
  };
}
