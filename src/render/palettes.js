// Paladin Survival RPG — paletas del renderer.
// Sin DOM: importable desde Node para tests.

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}

// Cada paleta de demonio:
//   body   — piel principal (oscura/saturada)
//   dark   — sombreado / contorno
//   light  — luces de la piel
//   horn   — cuernos / garras
//   eye    — ojos brillantes
//   glow   — color de efectos (humo de muerte, chispas)
export const VARIANT_PALETTES = deepFreeze({
  minor: [
    { name: 'ember',   body: '#a3201b', dark: '#3d0907', light: '#d9483a', horn: '#e8d7b0', eye: '#ffd23f', glow: '#ff6a2a' },
    { name: 'bile',    body: '#4f7a12', dark: '#1a2b05', light: '#86b52a', horn: '#d6cf9a', eye: '#ff3b2f', glow: '#a6e22e' },
    { name: 'dusk',    body: '#5b1f8a', dark: '#1f0833', light: '#8c4cc4', horn: '#cfc2e6', eye: '#4ff0ff', glow: '#b05cff' },
    { name: 'cinder',  body: '#3a3436', dark: '#121011', light: '#6b6265', horn: '#ff9c3a', eye: '#ff4a1c', glow: '#ff8c1a' },
  ],
  brute: [
    { name: 'magma',   body: '#7c1d0e', dark: '#2a0803', light: '#b8401f', horn: '#2b2220', eye: '#ffb02e', glow: '#ff5a1f' },
    { name: 'bruise',  body: '#43306e', dark: '#150d28', light: '#6e55a8', horn: '#d9c9a3', eye: '#ff2e63', glow: '#8f6bff' },
    { name: 'rot',     body: '#3f5a2a', dark: '#141f0c', light: '#6b8a45', horn: '#c2b280', eye: '#f4ff52', glow: '#9ad94a' },
    { name: 'obsidian',body: '#25222e', dark: '#09080d', light: '#4c4760', horn: '#c23b3b', eye: '#ff2020', glow: '#e0362b' },
  ],
  stalker: [
    { name: 'blood',   body: '#6e0f2a', dark: '#24040d', light: '#a8284c', horn: '#ece0d0', eye: '#ff3df2', glow: '#ff2e7a' },
    { name: 'venom',   body: '#0f5c55', dark: '#03201d', light: '#2a9488', horn: '#d8f5e8', eye: '#ffef3a', glow: '#2cf2c6' },
    { name: 'shade',   body: '#1d2547', dark: '#070a19', light: '#3c4c86', horn: '#a9b7ff', eye: '#7cf9ff', glow: '#5a7dff' },
    { name: 'sulfur',  body: '#7a5410', dark: '#2a1c03', light: '#b8892a', horn: '#3a2a10', eye: '#ff2a2a', glow: '#ffc21f' },
  ],
});

// Paladín: claro, metálico, dorado — máximo contraste con los demonios.
export const PLAYER_PALETTE = deepFreeze({
  armorLight: '#f4f6fb',
  armor: '#c9d1de',
  armorDark: '#6f7a8c',
  outline: '#1b1f29',
  gold: '#ffd257',
  goldDark: '#b0841f',
  cape: '#2f5fbf',
  capeDark: '#1a356e',
  visor: '#20242e',
  glow: '#fff1a8',
  hurt: '#ff3030',
});

// Estilo de la espada por tier (0 común, 1 reforzada, 2 larga, 3 rúnica).
export const SWORD_TIER_STYLES = deepFreeze([
  { name: 'common',     blade: '#9aa1ab', edge: '#d7dbe0', hilt: '#5a4632', guard: '#7d7f86', trail: '#c8ccd2', trailCore: '#ffffff', glow: null,      bladeLen: 1.00 },
  { name: 'reinforced', blade: '#7f9cc4', edge: '#cfe0ff', hilt: '#3c3550', guard: '#5d77a8', trail: '#8fb5ff', trailCore: '#e8f1ff', glow: null,      bladeLen: 1.08 },
  { name: 'long',       blade: '#d8dde6', edge: '#ffffff', hilt: '#6b5326', guard: '#e2c26a', trail: '#eef3ff', trailCore: '#ffffff', glow: '#ffffff', bladeLen: 1.25 },
  { name: 'runic',      blade: '#5fe3ff', edge: '#e6fbff', hilt: '#2b1b4a', guard: '#a35cff', trail: '#7a5cff', trailCore: '#5ff7ff', glow: '#5ff7ff', bladeLen: 1.35 },
]);

export const EFFECT_COLORS = deepFreeze({
  hit: '#fff4c2',
  hitCore: '#ffffff',
  playerHit: '#ff3b3b',
  levelUp: '#ffd257',
  levelUpCore: '#fff6c8',
  swordUp: '#6ff0ff',
  smoke: '#2a2228',
});

export const ARENA_COLORS = deepFreeze({
  base: '#1d1b22',
  tileA: '#26232c',
  tileB: '#221f28',
  grout: '#121016',
  crack: '#0d0b10',
  speck: '#34303b',
  rune: 'rgba(170, 60, 60, 0.16)',
  runeCircle: 'rgba(200, 80, 60, 0.13)',
  border: '#0a090c',
  borderStone: '#3a3540',
  borderHighlight: '#57505f',
  borderGlow: 'rgba(190, 50, 30, 0.35)',
  vignette: 'rgba(0, 0, 0, 0.6)',
});

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;

export function isValidColor(value) {
  return typeof value === 'string' && (HEX_RE.test(value) || RGB_RE.test(value));
}

// '#rrggbb' + alpha → 'rgba(...)'. Acepta #rgb y #rrggbb.
export function withAlpha(hex, alpha) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

export function getEnemyPalette(type, variant) {
  const list = VARIANT_PALETTES[type] || VARIANT_PALETTES.minor;
  const n = list.length;
  const v = Number.isInteger(variant) ? ((variant % n) + n) % n : 0;
  return list[v];
}

export function getSwordStyle(tier) {
  const t = Number.isInteger(tier) ? Math.max(0, Math.min(SWORD_TIER_STYLES.length - 1, tier)) : 0;
  return SWORD_TIER_STYLES[t];
}
