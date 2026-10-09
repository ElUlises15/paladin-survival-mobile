// Funciones puras de formateo para HUD y pantallas (sin DOM; testeables desde Node).

import { CONFIG } from '../config.js';

/** Segundos → 'mm:ss' (minutos sin tope: 125:07). Valores inválidos/negativos → '00:00'. */
export function formatTime(seconds) {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Entero con separador de miles '.' (estilo es): 12345 → '12.345'. */
export function formatInt(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * HP mostrado: redondea hacia arriba (con 0,3 HP se ve 1, no 0) pero tolera ruido de coma flotante
 * (112.00000000000001 → 112) y nunca supera el máximo mostrado.
 */
export function displayHp(hp, maxHp) {
  const v = Number.isFinite(hp) && hp > 0 ? Math.ceil(hp - 1e-6) : 0;
  return Math.min(v, Math.round(maxHp > 0 ? maxHp : 0));
}

/**
 * Relleno de cada corazón (0..1). Cada corazón vale maxHp / hearts.
 * heartFills(70, 100, 5) → [1, 1, 1, 0.5, 0]
 */
export function heartFills(hp, maxHp, hearts = CONFIG.player.hearts) {
  const n = Math.max(0, Math.floor(hearts) || 0);
  const out = new Array(n).fill(0);
  if (!(maxHp > 0) || n === 0) return out;
  const clamped = Math.min(Math.max(Number.isFinite(hp) ? hp : 0, 0), maxHp);
  const per = maxHp / n;
  for (let i = 0; i < n; i++) {
    const f = (clamped - i * per) / per;
    // redondeo a 0.01 para evitar ruido de coma flotante (y escrituras DOM innecesarias)
    out[i] = Math.round(Math.min(1, Math.max(0, f)) * 100) / 100;
  }
  return out;
}

/** Formato legible por atributo: velocidad entera, vel. ataque 2 decimales, resto ≤ 1 decimal. */
export function formatStat(key, value) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  switch (key) {
    case 'speed':
    case 'maxHp':
      return String(Math.round(v));
    case 'attackSpeed':
      return v.toFixed(2);
    default: {
      const r = Math.round(v * 10) / 10;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    }
  }
}

const BASE_KEY = {
  maxHp: 'baseMaxHp',
  attack: 'baseAttack',
  defense: 'baseDefense',
  speed: 'baseSpeed',
  attackSpeed: 'baseAttackSpeed',
};
const CAP_KEY = { speed: 'maxSpeed', attackSpeed: 'maxAttackSpeed' };

/**
 * Vista previa de invertir un punto en `key`: { current, next } numéricos.
 * next = current + base * manualPerPoint[key] (con caps de config), igual que la fórmula del sim.
 */
export function previewAttribute(player, key, config = CONFIG) {
  const current = player && typeof player[key] === 'number' ? player[key] : 0;
  const base = config.player[BASE_KEY[key]] ?? 0;
  const per = config.progression.manualPerPoint[key] ?? 0;
  let next = current + base * per;
  const cap = CAP_KEY[key] ? config.player[CAP_KEY[key]] : undefined;
  if (typeof cap === 'number') next = Math.min(next, cap);
  return { current, next };
}

/**
 * Progreso de la espada hacia el próximo tier según kills.
 * → { tier, tierCount, next: tierDef|null, remaining, fraction }  (fraction 0..1; 1 si ya está al máximo)
 */
export function swordProgress(kills, tierIndex, config = CONFIG) {
  const tiers = config.sword.tiers;
  const tier = Math.min(Math.max(0, tierIndex | 0), tiers.length - 1);
  const k = Number.isFinite(kills) ? Math.max(0, kills) : 0;
  const next = tiers[tier + 1] || null;
  if (!next) return { tier, tierCount: tiers.length, next: null, remaining: 0, fraction: 1 };
  const from = tiers[tier].killsRequired;
  const span = Math.max(1, next.killsRequired - from);
  const fraction = Math.min(1, Math.max(0, (k - from) / span));
  return { tier, tierCount: tiers.length, next, remaining: Math.max(0, next.killsRequired - k), fraction };
}

/** Fracción 0..1 de la recarga del ataque (1 = listo). */
export function cooldownReady(cooldownTimer, cooldown) {
  if (!(cooldown > 0) || !(cooldownTimer > 0)) return 1;
  return Math.min(1, Math.max(0, 1 - cooldownTimer / cooldown));
}
