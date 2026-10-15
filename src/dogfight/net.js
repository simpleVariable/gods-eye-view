import { NET } from './shared.js';

/**
 * Open the game socket and send the join request once connected.
 * @param {{name: string, plane: string, place?: {lat: number, lon: number}|null, onMessage: (msg: object) => void, onClose: (opened: boolean) => void}} options
 */
export function connect({ name, plane, place, onMessage, onClose }) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${location.host}${NET.path}`);
  let opened = false;

  ws.addEventListener('open', () => {
    opened = true;
    ws.send(JSON.stringify({ t: 'join', name, plane, place: place ?? undefined }));
  });
  ws.addEventListener('message', (event) => {
    try { onMessage(JSON.parse(event.data)); } catch { /* ignore malformed frame */ }
  });
  ws.addEventListener('close', () => onClose(opened));

  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() { ws.close(); },
  };
}
