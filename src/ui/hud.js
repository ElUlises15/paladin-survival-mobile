// HUD externo (panel lateral + barra inferior). Lee GameState; nunca lo muta.
// Cachea elementos una vez y solo toca el DOM cuando un valor mostrado cambia.

import { CONFIG } from '../config.js';
import { formatTime, formatInt, heartFills, formatStat, swordProgress, cooldownReady, displayHp } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART_PATH = 'M16 28 C16 28 2 19 2 10 C2 5 6 2 10 2 C13 2 15 4 16 6 C17 4 19 2 22 2 C26 2 30 5 30 10 C30 19 16 28 16 28 Z';

const IDS = [
  'hud-hearts', 'hud-hp', 'hud-hp-fill', 'hud-level', 'hud-xp-fill', 'hud-xp', 'hud-points', 'hud-points-value',
  'hud-attack', 'hud-defense', 'hud-speed', 'hud-attack-speed',
  'hud-time', 'hud-kills', 'hud-score', 'hud-wave', 'hud-alive', 'hud-queue', 'hud-wave-left',
  'hud-sword-name', 'hud-sword-tier', 'hud-sword-damage', 'hud-sword-range', 'hud-sword-arc',
  'hud-sword-next-fill', 'hud-sword-next', 'hud-cooldown', 'hud-cooldown-fill', 'hud-cooldown-text',
  'hud-spin', 'hud-spin-rank', 'hud-spin-cd', 'hud-spin-cd-fill', 'hud-spin-text', 'btn-touch-spin', 'spin-rank-badge',
];

let heartUid = 0;

export function createHud(root = document, config = CONFIG) {
  const el = {};
  for (const id of IDS) el[id] = root.getElementById(id);
  const doc = root.ownerDocument || root;
  const cache = new Map();

  // --- helpers que evitan escrituras redundantes ---
  function setText(id, value) {
    const node = el[id];
    if (!node) return;
    const v = String(value);
    if (cache.get(id) === v) return;
    cache.set(id, v);
    node.textContent = v;
  }
  function setScale(id, fraction, axis = 'X') {
    const node = el[id];
    if (!node) return;
    const f = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 1000;
    const key = `${id}:scale`;
    if (cache.get(key) === f) return;
    cache.set(key, f);
    node.style.transform = `scale${axis}(${f})`;
  }
  function setHidden(id, hidden) {
    const node = el[id];
    if (!node) return;
    const key = `${id}:hidden`;
    if (cache.get(key) === hidden) return;
    cache.set(key, hidden);
    node.hidden = hidden;
  }
  function setClass(id, cls, on) {
    const node = el[id];
    if (!node) return;
    const key = `${id}:${cls}`;
    if (cache.get(key) === on) return;
    cache.set(key, on);
    node.classList.toggle(cls, on);
  }

  // --- corazones (SVG con relleno parcial vía rect recortado por la silueta) ---
  const hearts = [];
  const heartCount = config.player.hearts;
  if (el['hud-hearts']) {
    const container = el['hud-hearts'];
    while (container.firstChild) container.removeChild(container.firstChild);
    for (let i = 0; i < heartCount; i++) {
      const clipId = `hud-heart-clip-${++heartUid}`;
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 32 30');
      svg.setAttribute('class', 'heart');
      svg.setAttribute('aria-hidden', 'true');
      const defs = doc.createElementNS(SVG_NS, 'defs');
      const clip = doc.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      const clipPath = doc.createElementNS(SVG_NS, 'path');
      clipPath.setAttribute('d', HEART_PATH);
      clip.appendChild(clipPath);
      defs.appendChild(clip);
      const bg = doc.createElementNS(SVG_NS, 'path');
      bg.setAttribute('d', HEART_PATH);
      bg.setAttribute('class', 'heart-bg');
      const fill = doc.createElementNS(SVG_NS, 'rect');
      fill.setAttribute('class', 'heart-fill');
      fill.setAttribute('x', '0');
      fill.setAttribute('y', '0');
      fill.setAttribute('height', '30');
      fill.setAttribute('width', '32');
      fill.setAttribute('clip-path', `url(#${clipId})`);
      const outline = doc.createElementNS(SVG_NS, 'path');
      outline.setAttribute('d', HEART_PATH);
      outline.setAttribute('class', 'heart-outline');
      svg.append(defs, bg, fill, outline);
      container.appendChild(svg);
      hearts.push({ svg, fill, value: 1 });
    }
  }
  function setHearts(fills) {
    for (let i = 0; i < hearts.length; i++) {
      const h = hearts[i];
      const f = fills[i] ?? 0;
      if (h.value === f) continue;
      h.value = f;
      // el corazón se rellena de izquierda a derecha (x del path: 2..30)
      h.fill.setAttribute('width', String(f >= 1 ? 32 : f <= 0 ? 0 : 2 + 28 * f));
      h.svg.classList.toggle('is-empty', f <= 0);
    }
  }

  function update(state) {
    if (!state || !state.player) return;
    const p = state.player;
    const s = state.sword || {};

    // Vida
    const maxHp = p.maxHp > 0 ? p.maxHp : 1;
    const hp = Math.max(0, p.hp);
    setHearts(heartFills(hp, maxHp, heartCount));
    const shownHp = displayHp(hp, maxHp);
    setText('hud-hp', `${shownHp} / ${Math.round(maxHp)}`);
    setScale('hud-hp-fill', hp / maxHp);
    if (el['hud-hearts']) {
      const label = `Vida ${shownHp} de ${Math.round(maxHp)}`;
      if (cache.get('hearts-label') !== label) {
        cache.set('hearts-label', label);
        el['hud-hearts'].setAttribute('aria-label', label);
      }
    }

    // Nivel / XP
    setText('hud-level', p.level);
    const xpNext = p.xpToNext > 0 ? p.xpToNext : 1;
    setText('hud-xp', `${Math.floor(p.xp)} / ${Math.round(xpNext)}`);
    setScale('hud-xp-fill', p.xp / xpNext);
    const pending = p.pendingPoints | 0;
    setHidden('hud-points', pending <= 0);
    setText('hud-points-value', pending);

    // Atributos
    setText('hud-attack', formatStat('attack', p.attack));
    setText('hud-defense', formatStat('defense', p.defense));
    setText('hud-speed', formatStat('speed', p.speed));
    setText('hud-attack-speed', formatStat('attackSpeed', p.attackSpeed));

    // Partida
    setText('hud-time', formatTime(state.time));
    setText('hud-kills', formatInt(state.kills));
    setText('hud-score', formatInt(state.score));
    const wave = state.wave || {};
    setText('hud-wave', wave.number ?? 1);
    setText('hud-alive', Array.isArray(state.enemies) ? state.enemies.length : 0);
    setText('hud-queue', state.spawnQueue | 0);
    // Enemigos de la oleada actual que aún no fueron programados (vivos y cola se muestran aparte).
    const left = Math.max(0, (wave.total | 0) - (wave.scheduled | 0));
    setText('hud-wave-left', left);

    // Espada
    const tierCount = config.sword.tiers.length;
    const tier = Math.min(Math.max(0, s.tier | 0), tierCount - 1);
    setText('hud-sword-name', s.name || config.sword.tiers[tier].name);
    setText('hud-sword-tier', `Nv ${tier + 1}/${tierCount}`);
    setText('hud-sword-damage', formatStat('attack', s.damage));
    setText('hud-sword-range', Math.round(s.range || 0));
    setText('hud-sword-arc', `${Math.round(s.arcDeg || 0)}°`);
    const prog = swordProgress(state.kills, tier, config);
    setScale('hud-sword-next-fill', prog.fraction);
    setText('hud-sword-next', prog.next
      ? `Próxima: ${prog.next.name} · faltan ${prog.remaining} kills`
      : 'Espada al máximo nivel');

    // Cooldown de ataque
    const ready = cooldownReady(s.cooldownTimer, s.cooldown);
    setScale('hud-cooldown-fill', ready, 'Y');
    const isReady = ready >= 1;
    setClass('hud-cooldown', 'is-ready', isReady);
    setText('hud-cooldown-text', isReady ? 'LISTO' : `${Math.max(0, s.cooldownTimer).toFixed(1)}s`);

    // Habilidad Giro (slot de escritorio + botón táctil)
    const sp = state.spin || { rank: 0 };
    const spinCfg = config.spin || { unlockLevel: 10, rankLevels: [] };
    const rank = sp.rank | 0;
    const maxRank = spinCfg.rankLevels ? spinCfg.rankLevels.length : 5;
    const unlocked = rank >= 1;
    setClass('hud-spin', 'is-locked', !unlocked);
    setHidden('btn-touch-spin', !unlocked);
    if (!unlocked) {
      setText('hud-spin-rank', `nivel ${spinCfg.unlockLevel}`);
      setText('hud-spin-text', 'Bloq.');
      setScale('hud-spin-cd-fill', 0, 'Y');
      setClass('hud-spin-cd', 'is-ready', false);
    } else {
      setText('hud-spin-rank', `Rango ${rank}/${maxRank}`);
      setText('spin-rank-badge', rank);
      const cd = sp.cooldown > 0 ? sp.cooldown : 1;
      const left = Math.max(0, sp.cooldownTimer || 0);
      const spinReady = left <= 0 && !(sp.timer > 0);
      setScale('hud-spin-cd-fill', 1 - left / cd, 'Y');
      setClass('hud-spin-cd', 'is-ready', spinReady);
      setText('hud-spin-text', spinReady ? 'LISTO' : `${left.toFixed(1)}s`);
      setClass('btn-touch-spin', 'is-cooling', !spinReady);
      const node = el['btn-touch-spin'];
      if (node) {
        const f = Math.round((left / cd) * 100) / 100;
        if (cache.get('spin-cd-var') !== f && node.style && typeof node.style.setProperty === 'function') {
          cache.set('spin-cd-var', f);
          node.style.setProperty('--cd', String(f));
        }
      }
    }
  }

  function reset() {
    cache.clear();
    for (const h of hearts) h.value = -1; // fuerza reescritura en el próximo update
  }

  return { update, reset };
}
