import { clamp } from './shared.js';

const BLOCKED_DEFAULTS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

/**
 * Keyboard / mouse controls with smoothed axes.
 * `state.pitch > 0` pulls the nose up, `roll > 0` banks right, `yaw > 0` turns right.
 */
export function createInput({ onCamera } = {}) {
  const keys = new Set();
  let mouseFire = false;
  let enabled = false;

  const state = {
    pitch: 0, roll: 0, yaw: 0, throttle: 0.6,
    fire: false, assist: true, board: false,
  };

  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

  window.addEventListener('keydown', (e) => {
    if (!enabled || typing(e)) return;
    if (BLOCKED_DEFAULTS.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyG') state.assist = !state.assist;
    if (e.code === 'KeyC') onCamera?.();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseFire = false; });
  window.addEventListener('mousedown', (e) => {
    if (enabled && e.button === 0) mouseFire = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseFire = false; });

  const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  const ease = (value, target, dt) => {
    const rate = target === 0 ? 9 : 5;
    return value + clamp(target - value, -rate * dt, rate * dt);
  };

  return {
    state,
    setEnabled(on) { enabled = on; if (!on) { keys.clear(); mouseFire = false; } },
    setThrottle(v) { state.throttle = clamp(v, 0, 1); },
    update(dt) {
      const pitchTarget = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
        - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const rollTarget = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.pitch = ease(state.pitch, pitchTarget, dt);
      state.roll = ease(state.roll, rollTarget, dt);
      state.yaw = ease(state.yaw, axis('KeyQ', 'KeyE'), dt);
      state.throttle = clamp(state.throttle + axis('KeyF', 'KeyR') * 0.45 * dt, 0, 1);
      state.fire = keys.has('Space') || mouseFire;
      state.board = keys.has('Tab');
    },
  };
}
