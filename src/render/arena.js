// Paladin Survival RPG — fondo de arena procedural, rasterizado UNA vez en un canvas offscreen.

import { ARENA_COLORS as C } from './palettes.js';

const TAU = Math.PI * 2;

// RNG determinista (mulberry32) para que la arena sea siempre igual.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(base, amount) {
  // base '#rrggbb' → aclara/oscurece por amount (-1..1)
  const n = parseInt(base.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// Glifo rúnico simple hecho de trazos, centrado en (x, y).
function rune(ctx, rand, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  const kind = Math.floor(rand() * 5);
  if (kind === 0) {
    ctx.moveTo(x, y - s * 0.4); ctx.lineTo(x + s * 0.6, y - s);
    ctx.moveTo(x, y); ctx.lineTo(x + s * 0.6, y - s * 0.4);
  } else if (kind === 1) {
    ctx.moveTo(x - s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 0.6, y + s * 0.2);
  } else if (kind === 2) {
    ctx.moveTo(x, y - s * 0.2); ctx.lineTo(x + s * 0.55, y + s * 0.3); ctx.lineTo(x, y + s * 0.8);
  } else if (kind === 3) {
    ctx.moveTo(x - s * 0.55, y - s); ctx.lineTo(x + s * 0.55, y + s);
    ctx.moveTo(x + s * 0.55, y - s); ctx.lineTo(x - s * 0.55, y + s);
  } else {
    ctx.moveTo(x - s * 0.5, y - s * 0.5); ctx.lineTo(x, y); ctx.lineTo(x + s * 0.5, y - s * 0.5);
  }
  ctx.stroke();
}

export function drawArena(ctx, width, height, seed = 1337) {
  const rand = mulberry32(seed);

  // Base
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, width, height);

  // Losas de piedra (45 px → 32×18 en 1440×810)
  const tile = 45;
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tile;
      const y = row * tile;
      const base = (row + col) % 2 === 0 ? C.tileA : C.tileB;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.035);
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      // bisel: luz arriba/izq, sombra abajo/der
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x + 1, y + 1, tile - 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, tile - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 1, y + tile - 3, tile - 2, 2);
      ctx.fillRect(x + tile - 3, y + 1, 2, tile - 2);
      // motas
      ctx.fillStyle = C.speck;
      const specks = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < specks; i++) {
        ctx.fillRect(x + 3 + rand() * (tile - 7), y + 3 + rand() * (tile - 7), 1 + rand() * 1.5, 1 + rand() * 1.5);
      }
      // grietas ocasionales
      if (rand() < 0.14) {
        ctx.strokeStyle = C.crack;
        ctx.lineWidth = 1 + rand();
        ctx.beginPath();
        let cx = x + 4 + rand() * (tile - 8);
        let cy = y + 4 + rand() * (tile - 8);
        ctx.moveTo(cx, cy);
        const segs = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < segs; i++) {
          cx = Math.max(x + 2, Math.min(x + tile - 2, cx + (rand() - 0.5) * 22));
          cy = Math.max(y + 2, Math.min(y + tile - 2, cy + (rand() - 0.5) * 22));
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
  }
  // Juntas
  ctx.fillStyle = C.grout;
  for (let col = 0; col <= cols; col++) ctx.fillRect(col * tile - 1, 0, 2, height);
  for (let row = 0; row <= rows; row++) ctx.fillRect(0, row * tile - 1, width, 2);

  // Runas sueltas sutiles
  ctx.strokeStyle = C.rune;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    rune(ctx, rand, 40 + rand() * (width - 80), 40 + rand() * (height - 80), 5 + rand() * 4);
  }

  // Círculo rúnico central
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * 0.3;
  ctx.strokeStyle = C.runeCircle;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.32, 0, TAU); ctx.stroke();
  // Estrella de 7 puntas inscripta
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = -Math.PI / 2 + (i * 3 * TAU) / 7;
    const px = cx + Math.cos(a) * R * 0.86;
    const py = cy + Math.sin(a) * R * 0.86;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // Glifos en el anillo
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    rune(ctx, rand, cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93, 5);
  }

  // Viñeta suave
  const vg = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.35, cx, cy, Math.hypot(cx, cy));
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, C.vignette);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  // Borde marcado: muro de piedra + brillo infernal hacia adentro
  const b = 10;
  ctx.fillStyle = C.border;
  ctx.fillRect(0, 0, width, b);
  ctx.fillRect(0, height - b, width, b);
  ctx.fillRect(0, 0, b, height);
  ctx.fillRect(width - b, 0, b, height);
  ctx.fillStyle = C.borderStone;
  ctx.fillRect(2, 2, width - 4, 3);
  ctx.fillRect(2, height - 5, width - 4, 3);
  ctx.fillRect(2, 2, 3, height - 4);
  ctx.fillRect(width - 5, 2, 3, height - 4);
  ctx.strokeStyle = C.borderHighlight;
  ctx.lineWidth = 1;
  ctx.strokeRect(b + 0.5, b + 0.5, width - 2 * b - 1, height - 2 * b - 1);

  const glow = 26;
  const sides = [
    [0, b, 0, b + glow, b, b, width - 2 * b, glow],
    [0, height - b, 0, height - b - glow, b, height - b - glow, width - 2 * b, glow],
    [b, 0, b + glow, 0, b, b, glow, height - 2 * b],
    [width - b, 0, width - b - glow, 0, width - b - glow, b, glow, height - 2 * b],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, C.borderGlow);
    g.addColorStop(1, 'rgba(190, 50, 30, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  }
}

// Construye el canvas cacheado de la arena.
export function buildArenaCanvas(createCanvas, width, height, seed) {
  const canvas = createCanvas(width, height);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  drawArena(canvas.getContext('2d'), width, height, seed);
  return canvas;
}

// Viñeta roja de daño a pantalla completa (cacheada; se dibuja con globalAlpha variable).
export function buildDamageVignette(createCanvas, width, height) {
  const canvas = createCanvas(width, height);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  const cx = width / 2;
  const cy = height / 2;
  const g = ctx.createRadialGradient(cx, cy, Math.min(width, height) * 0.4, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, 'rgba(200, 0, 0, 0)');
  g.addColorStop(1, 'rgba(200, 0, 0, 0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}
