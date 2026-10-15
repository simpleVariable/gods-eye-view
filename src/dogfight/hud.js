import { ARENA, PLANES, headingDeg } from './shared.js';

const RADAR_RANGE_M = 8000;
const MS_TO_KMH = 3.6;

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    root: $('hud'),
    spd: $('v-spd'), alt: $('v-alt'), hdg: $('v-hdg'), assist: $('v-assist'),
    thr: $('bar-thr'), hp: $('bar-hp'), hpText: $('v-hp'), ammo: $('bar-ammo'), kd: $('v-kd'),
    boardRoot: $('board'), boardList: $('board-list'), net: $('v-net'),
    alerts: $('alerts'), feed: $('feed'),
    death: $('death'), deathTitle: $('death-title'), deathSub: $('death-sub'), deathTimer: $('death-timer'),
    flash: $('damage-flash'), hitMarker: $('hit-marker'),
    lead: $('lead'), lock: $('lock'), tags: $('tags'),
    radar: $('radar'),
    controlsBtn: $('controls-btn'), controls: $('controls'),
    scoreboard: $('scoreboard'), scoreboardBody: $('scoreboard-body'),
  };
  const ctx = el.radar.getContext('2d');
  const tagEls = new Map();
  let hitTimer = 0;
  let controlsTimer = 0;

  function setControls(open) {
    clearTimeout(controlsTimer);
    el.controls.hidden = !open;
    el.controlsBtn.setAttribute('aria-expanded', String(open));
  }
  el.controlsBtn.addEventListener('click', () => {
    setControls(el.controls.hidden);
    el.controlsBtn.blur();
  });

  function place(node, point) {
    if (!point) { node.hidden = true; return; }
    node.hidden = false;
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
  }

  return {
    show(on) { el.root.hidden = !on; },

    toggleControls() { setControls(el.controls.hidden); },

    /** Open the controls panel, then close it again after `ms`. */
    flashControls(ms) {
      setControls(true);
      controlsTimer = setTimeout(() => setControls(false), ms);
    },

    feed(text, cls = '') {
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      el.feed.append(li);
      while (el.feed.children.length > 6) el.feed.firstChild.remove();
      setTimeout(() => li.remove(), 7000);
    },

    flashDamage() {
      el.flash.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => el.flash.classList.remove('on')));
    },

    hitMarker() {
      el.hitMarker.hidden = false;
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => { el.hitMarker.hidden = true; }, 140);
    },

    showDeath(title, sub) {
      el.deathTitle.textContent = title;
      el.deathSub.textContent = sub;
      el.death.hidden = false;
    },
    deathCountdown(seconds) { el.deathTimer.textContent = seconds > 0 ? `Respawning in ${seconds}` : 'Respawning…'; },
    hideDeath() { el.death.hidden = true; },

    /** Main per-frame readout for the player's own aircraft. */
    flight({ me, plane, assist, alerts }) {
      el.spd.textContent = Math.round(me.flight.speed * MS_TO_KMH);
      el.alt.textContent = Math.max(0, Math.round(me.flight.p[2]));
      el.hdg.textContent = String(Math.round(headingDeg(me.flight.f)) % 360).padStart(3, '0');
      el.thr.style.width = `${Math.round(me.flight.throttle * 100)}%`;
      el.assist.textContent = assist ? 'ON' : 'OFF';
      el.hp.style.width = `${Math.max(0, (me.hp / plane.hp) * 100)}%`;
      el.hpText.textContent = Math.max(0, Math.round(me.hp));
      el.ammo.style.width = `${Math.max(0, (me.ammo / 400) * 100)}%`;
      el.kd.textContent = `${me.kills} / ${me.deaths}`;

      el.alerts.replaceChildren(...alerts.map((a) => {
        const d = document.createElement('div');
        d.textContent = a.text;
        if (a.bad) d.className = 'bad';
        return d;
      }));
    },

    sights({ lead, lock }) {
      place(el.lead, lead);
      place(el.lock, lock);
    },

    board(players, meId, pingMs) {
      el.net.textContent = `${players.length} online · ${pingMs} ms`;
      const sorted = [...players].sort((a, b) => b.k - a.k || a.d - b.d).slice(0, 6);
      el.boardList.replaceChildren(...sorted.map((p) => {
        const li = document.createElement('li');
        if (p.id === meId) li.className = 'me';
        if (!p.a) li.classList.add('dead');
        const name = document.createElement('span');
        name.className = 'nm';
        name.textContent = `${p.n} · ${PLANES[p.pl]?.name ?? p.pl}`;
        const score = document.createElement('span');
        score.textContent = `${p.k}/${p.d}`;
        li.append(name, score);
        return li;
      }));
    },

    /** Full-screen scoreboard shown while Tab is held. */
    scoreboard(players, meId, show) {
      el.scoreboard.hidden = !show;
      if (!show) return;
      const sorted = [...players].sort((a, b) => b.k - a.k || a.d - b.d);
      el.scoreboardBody.replaceChildren(...sorted.map((p) => {
        const tr = document.createElement('tr');
        if (p.id === meId) tr.className = 'me';
        else if (!p.a) tr.className = 'dead';
        for (const text of [p.n, PLANES[p.pl]?.name ?? p.pl, p.k, p.d]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }));
    },

    /** Floating callsigns above enemy aircraft. `items`: {id, name, hpFrac, dist, point}. */
    tags(items) {
      const live = new Set();
      for (const item of items) {
        if (!item.point) continue;
        live.add(item.id);
        let node = tagEls.get(item.id);
        if (!node) {
          node = document.createElement('div');
          node.className = 'tag';
          const label = document.createElement('div');
          const bar = document.createElement('div');
          bar.className = 'hpbar';
          bar.append(document.createElement('div'));
          node.append(label, bar);
          el.tags.append(node);
          tagEls.set(item.id, node);
        }
        node.style.left = `${item.point.x}px`;
        node.style.top = `${item.point.y - 26}px`;
        node.firstChild.textContent = `${item.name} ${(item.dist / 1000).toFixed(1)}km`;
        node.lastChild.firstChild.style.width = `${Math.round(item.hpFrac * 100)}%`;
      }
      for (const [id, node] of tagEls) {
        if (!live.has(id)) { node.remove(); tagEls.delete(id); }
      }
    },

    radarFrame(me, others) {
      const size = el.radar.width;
      const c = size / 2;
      const scale = c / RADAR_RANGE_M;
      const h = Math.atan2(me.flight.f[0], me.flight.f[1]);
      const fx = Math.sin(h); const fy = Math.cos(h);
      const rx = Math.cos(h); const ry = -Math.sin(h);
      const toRadar = (p) => {
        const dx = p[0] - me.flight.p[0];
        const dy = p[1] - me.flight.p[1];
        return [c + (dx * rx + dy * ry) * scale, c - (dx * fx + dy * fy) * scale];
      };

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c - 2, 0, Math.PI * 2);
      ctx.clip();

      const [ax, ay] = toRadar([0, 0]);
      ctx.strokeStyle = 'rgba(255,84,104,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ax, ay, ARENA.radiusM * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(94,225,255,0.25)';
      ctx.lineWidth = 1;
      for (const frac of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.arc(c, c, c * frac, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const o of others) {
        const [x, y] = toRadar(o.p);
        const above = o.p[2] - me.flight.p[2];
        ctx.fillStyle = above > 150 ? '#ffd34d' : above < -150 ? '#9a6bff' : '#ff5468';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = '#5ee1ff';
      ctx.beginPath();
      ctx.moveTo(c, c - 12);
      ctx.lineTo(c + 8, c + 9);
      ctx.lineTo(c - 8, c + 9);
      ctx.closePath();
      ctx.fill();
    },
  };
}
