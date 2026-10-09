// Paladin Survival RPG — sprites procedurales cacheados.
// Todo se dibuja una sola vez en canvas offscreen (por tipo + variante + estado) y luego se usa drawImage.
// Los sprites miran hacia +x (ángulo 0); el renderer los rota según `facing`.

import { VARIANT_PALETTES, PLAYER_PALETTE, getEnemyPalette, withAlpha } from './palettes.js';

// Radio de referencia con el que se rasterizan los sprites (se escalan a enemy.radius al dibujar).
export const SPRITE_REF_RADIUS = 32;
// Medio lado del canvas del sprite, en múltiplos del radio (deja lugar a cuernos/garras/capa/cola).
export const SPRITE_EXTENT = 1.9;

const TAU = Math.PI * 2;

export function defaultCreateCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error('renderer: no hay OffscreenCanvas ni document; pasá options.createCanvas');
}

function makeCanvas(createCanvas, w, h) {
  const canvas = createCanvas(w, h);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// ---------------------------------------------------------------------------
// Helpers de dibujo
// ---------------------------------------------------------------------------

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function shadedFill(ctx, x, y, r, light, mid, dark) {
  const g = ctx.createRadialGradient(x + r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, dark);
  return g;
}

function glowEyes(ctx, pts, r, eye) {
  for (let i = 0; i < pts.length; i += 2) {
    ctx.fillStyle = withAlpha(eye, 0.35);
    circle(ctx, pts[i], pts[i + 1], r * 2.1);
    ctx.fill();
    ctx.fillStyle = eye;
    circle(ctx, pts[i], pts[i + 1], r);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(ctx, pts[i] + r * 0.25, pts[i + 1] - r * 0.25, r * 0.35);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Demonios (vista cenital, mirando a +x). r = radio de referencia.
// ---------------------------------------------------------------------------

function drawMinor(ctx, r, p) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = Math.max(1.5, r * 0.07);

  // Cola fina con punta de flecha
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.quadraticCurveTo(-r * 1.15, r * 0.45, -r * 1.45, r * 0.1);
  ctx.stroke();
  ctx.fillStyle = p.horn;
  poly(ctx, [-r * 1.35, r * 0.05, -r * 1.7, -r * 0.05, -r * 1.5, r * 0.3]);
  ctx.fill();

  // Alitas membranosas pequeñas
  ctx.fillStyle = p.dark;
  poly(ctx, [-r * 0.2, -r * 0.5, -r * 0.95, -r * 1.2, -r * 0.75, -r * 0.55, -r * 0.6, -r * 0.35]);
  ctx.fill();
  poly(ctx, [-r * 0.2, r * 0.5, -r * 0.95, r * 1.2, -r * 0.75, r * 0.55, -r * 0.6, r * 0.35]);
  ctx.fill();

  // Manitos
  ctx.fillStyle = p.body;
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = outline;
  for (const s of [-1, 1]) {
    circle(ctx, r * 0.35, s * r * 0.72, r * 0.2);
    ctx.fill();
    ctx.stroke();
  }

  // Cuerpo
  ctx.fillStyle = shadedFill(ctx, 0, 0, r * 0.8, p.light, p.body, p.dark);
  circle(ctx, -r * 0.05, 0, r * 0.78);
  ctx.fill();
  ctx.stroke();

  // Cabeza
  ctx.fillStyle = shadedFill(ctx, r * 0.42, 0, r * 0.5, p.light, p.body, p.dark);
  circle(ctx, r * 0.42, 0, r * 0.48);
  ctx.fill();
  ctx.stroke();

  // Cuernitos curvos hacia adelante/afuera
  ctx.fillStyle = p.horn;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.38, s * r * 0.3);
    ctx.quadraticCurveTo(r * 0.75, s * r * 0.85, r * 1.15, s * r * 0.72);
    ctx.quadraticCurveTo(r * 0.8, s * r * 0.55, r * 0.62, s * r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = outline * 0.7;
    ctx.stroke();
  }

  glowEyes(ctx, [r * 0.7, -r * 0.17, r * 0.7, r * 0.17], r * 0.1, p.eye);
}

function drawBrute(ctx, r, p) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = Math.max(1.5, r * 0.08);
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = outline;

  // Puños masivos adelante
  for (const s of [-1, 1]) {
    ctx.fillStyle = shadedFill(ctx, r * 0.62, s * r * 0.86, r * 0.3, p.light, p.body, p.dark);
    circle(ctx, r * 0.62, s * r * 0.86, r * 0.3);
    ctx.fill();
    ctx.stroke();
    // nudillos
    ctx.fillStyle = p.horn;
    for (let k = -1; k <= 1; k++) {
      circle(ctx, r * 0.88, s * r * 0.86 + k * r * 0.12, r * 0.06);
      ctx.fill();
    }
  }

  // Torso ancho (más ancho en y que en x)
  ctx.fillStyle = shadedFill(ctx, 0, 0, r, p.light, p.body, p.dark);
  ellipse(ctx, -r * 0.08, 0, r * 0.72, r * 0.98);
  ctx.fill();
  ctx.stroke();

  // Hombreras / hombros masivos con púas
  for (const s of [-1, 1]) {
    ctx.fillStyle = shadedFill(ctx, -r * 0.05, s * r * 0.82, r * 0.45, p.light, p.body, p.dark);
    circle(ctx, -r * 0.05, s * r * 0.82, r * 0.44);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.horn;
    poly(ctx, [-r * 0.25, s * r * 0.95, -r * 0.15, s * r * 1.5, r * 0.05, s * r * 1.0]);
    ctx.fill();
    ctx.stroke();
    poly(ctx, [-r * 0.45, s * r * 0.7, -r * 0.75, s * r * 1.15, -r * 0.3, s * r * 0.95]);
    ctx.fill();
    ctx.stroke();
  }

  // Placas/espina en la espalda
  ctx.fillStyle = p.dark;
  for (let i = 0; i < 3; i++) {
    const x = -r * (0.25 + i * 0.22);
    poly(ctx, [x + r * 0.1, -r * 0.1, x - r * 0.15, 0, x + r * 0.1, r * 0.1]);
    ctx.fill();
  }

  // Cabeza pequeña hundida entre los hombros
  ctx.fillStyle = shadedFill(ctx, r * 0.42, 0, r * 0.36, p.light, p.body, p.dark);
  circle(ctx, r * 0.42, 0, r * 0.34);
  ctx.fill();
  ctx.stroke();
  // Cuernos cortos y gruesos
  ctx.fillStyle = p.horn;
  for (const s of [-1, 1]) {
    poly(ctx, [r * 0.4, s * r * 0.22, r * 0.78, s * r * 0.48, r * 0.6, s * r * 0.12]);
    ctx.fill();
    ctx.stroke();
  }
  glowEyes(ctx, [r * 0.62, -r * 0.12, r * 0.62, r * 0.12], r * 0.075, p.eye);
}

function drawStalker(ctx, r, p) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = Math.max(1.5, r * 0.07);

  // Cola larga
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.bezierCurveTo(-r * 1.2, -r * 0.35, -r * 1.45, r * 0.4, -r * 1.8, r * 0.1);
  ctx.stroke();

  // Brazos largos con garras hacia adelante
  for (const s of [-1, 1]) {
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = r * 0.24;
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, s * r * 0.5);
    ctx.quadraticCurveTo(r * 0.45, s * r * 0.95, r * 0.95, s * r * 0.72);
    ctx.stroke();
    ctx.strokeStyle = p.body;
    ctx.lineWidth = r * 0.14;
    ctx.stroke();
    // Tres garras
    ctx.fillStyle = p.horn;
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = outline * 0.6;
    const bx = r * 0.95;
    const by = s * r * 0.72;
    for (let k = -1; k <= 1; k++) {
      const ty = by + s * k * r * 0.18 - s * r * 0.12;
      poly(ctx, [bx - r * 0.05, by - r * 0.06 + k * r * 0.08, bx + r * 0.7, ty, bx + r * 0.05, by + r * 0.06 + k * r * 0.08]);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Cuerpo alargado encorvado
  ctx.strokeStyle = p.dark;
  ctx.lineWidth = outline;
  ctx.fillStyle = shadedFill(ctx, -r * 0.1, 0, r * 0.95, p.light, p.body, p.dark);
  ellipse(ctx, -r * 0.15, 0, r * 0.9, r * 0.58);
  ctx.fill();
  ctx.stroke();

  // Columna con púas (lomo encorvado)
  ctx.fillStyle = p.horn;
  for (let i = 0; i < 5; i++) {
    const x = r * (0.25 - i * 0.24);
    const h = r * (0.32 - Math.abs(i - 1.5) * 0.05);
    poly(ctx, [x + r * 0.08, -r * 0.08, x - h, 0, x + r * 0.08, r * 0.08]);
    ctx.fill();
  }

  // Cabeza estrecha y adelantada
  ctx.fillStyle = shadedFill(ctx, r * 0.7, 0, r * 0.36, p.light, p.body, p.dark);
  ellipse(ctx, r * 0.7, 0, r * 0.4, r * 0.28);
  ctx.fill();
  ctx.stroke();
  // Cuernos hacia atrás
  ctx.fillStyle = p.horn;
  for (const s of [-1, 1]) {
    poly(ctx, [r * 0.62, s * r * 0.18, r * 0.2, s * r * 0.5, r * 0.5, s * r * 0.1]);
    ctx.fill();
  }
  glowEyes(ctx, [r * 0.92, -r * 0.1, r * 0.92, r * 0.1], r * 0.07, p.eye);
}

const ENEMY_DRAWERS = { minor: drawMinor, brute: drawBrute, stalker: drawStalker };

// ---------------------------------------------------------------------------
// Paladín (vista cenital, mirando a +x; mano de la espada en +y = derecha)
// ---------------------------------------------------------------------------

function drawPaladin(ctx, r) {
  const P = PLAYER_PALETTE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const outline = Math.max(1.5, r * 0.07);

  // Capa corta detrás de los hombros
  const capeGrad = ctx.createLinearGradient(-r * 1.3, 0, 0, 0);
  capeGrad.addColorStop(0, P.capeDark);
  capeGrad.addColorStop(1, P.cape);
  ctx.fillStyle = capeGrad;
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = outline;
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.78);
  ctx.quadraticCurveTo(-r * 0.9, -r * 0.95, -r * 1.3, -r * 0.62);
  ctx.quadraticCurveTo(-r * 1.45, 0, -r * 1.3, r * 0.62);
  ctx.quadraticCurveTo(-r * 0.9, r * 0.95, -r * 0.1, r * 0.78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Ribete dorado de la capa
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-r * 1.22, -r * 0.58);
  ctx.quadraticCurveTo(-r * 1.36, 0, -r * 1.22, r * 0.58);
  ctx.stroke();

  // Brazo/mano izquierda (libre) y derecha (espada)
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = outline;
  for (const s of [-1, 1]) {
    ctx.fillStyle = shadedFill(ctx, r * 0.35, s * r * 0.78, r * 0.22, P.armorLight, P.armor, P.armorDark);
    circle(ctx, r * 0.35, s * r * 0.78, r * 0.22);
    ctx.fill();
    ctx.stroke();
  }

  // Torso / peto metálico
  ctx.fillStyle = shadedFill(ctx, 0, 0, r * 0.85, P.armorLight, P.armor, P.armorDark);
  ellipse(ctx, 0, 0, r * 0.62, r * 0.8);
  ctx.fill();
  ctx.stroke();

  // Hombreras con borde dorado
  for (const s of [-1, 1]) {
    ctx.fillStyle = shadedFill(ctx, -r * 0.05, s * r * 0.68, r * 0.38, P.armorLight, P.armor, P.armorDark);
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = outline;
    ellipse(ctx, -r * 0.05, s * r * 0.68, r * 0.36, r * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.ellipse(-r * 0.05, s * r * 0.68, r * 0.27, r * 0.21, 0, 0, TAU);
    ctx.stroke();
  }

  // Yelmo
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = outline;
  ctx.fillStyle = shadedFill(ctx, r * 0.12, 0, r * 0.48, '#ffffff', P.armorLight, P.armor);
  circle(ctx, r * 0.12, 0, r * 0.46);
  ctx.fill();
  ctx.stroke();
  // Visor en T
  ctx.fillStyle = P.visor;
  ctx.fillRect(r * 0.36, -r * 0.24, r * 0.1, r * 0.48);
  ctx.fillRect(r * 0.2, -r * 0.05, r * 0.26, r * 0.1);
  // Cresta dorada luminosa (cruz sobre el yelmo)
  ctx.fillStyle = withAlpha(P.glow, 0.45);
  circle(ctx, r * 0.08, 0, r * 0.28);
  ctx.fill();
  ctx.fillStyle = P.gold;
  ctx.strokeStyle = P.goldDark;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.fillRect(-r * 0.22, -r * 0.05, r * 0.5, r * 0.1);
  ctx.fillRect(-r * 0.04, -r * 0.2, r * 0.1, r * 0.4);
  ctx.strokeRect(-r * 0.22, -r * 0.05, r * 0.5, r * 0.1);
  ctx.fillStyle = P.glow;
  circle(ctx, r * 0.01, 0, r * 0.07);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function tintCopy(createCanvas, src, color, alpha) {
  const { canvas, ctx } = makeCanvas(createCanvas, src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

export function createSpriteCache(createCanvas = defaultCreateCanvas) {
  const R = SPRITE_REF_RADIUS;
  const half = Math.ceil(R * SPRITE_EXTENT);
  const size = half * 2;
  const cache = new Map();

  function rasterize(drawFn, ...args) {
    const { canvas, ctx } = makeCanvas(createCanvas, size, size);
    ctx.save();
    ctx.translate(half, half);
    drawFn(ctx, R, ...args);
    ctx.restore();
    return canvas;
  }

  function get(key, build) {
    let v = cache.get(key);
    if (!v) {
      v = build();
      cache.set(key, v);
    }
    return v;
  }

  function enemyBase(type, variant) {
    const t = ENEMY_DRAWERS[type] ? type : 'minor';
    const pal = getEnemyPalette(t, variant);
    const v = VARIANT_PALETTES[t].indexOf(pal);
    return { t, v, pal };
  }

  const api = {
    refRadius: R,
    half,
    size,

    // mode: 'normal' | 'flash' (blanco) | 'ghost' (estela de dash)
    enemy(type, variant, mode = 'normal') {
      const { t, v, pal } = enemyBase(type, variant);
      const baseKey = `e:${t}:${v}:normal`;
      const base = get(baseKey, () => rasterize(ENEMY_DRAWERS[t], pal));
      if (mode === 'normal') return base;
      if (mode === 'flash') return get(`e:${t}:${v}:flash`, () => tintCopy(createCanvas, base, '#ffffff', 0.85));
      return get(`e:${t}:${v}:ghost`, () => tintCopy(createCanvas, base, pal.glow, 0.75));
    },

    // mode: 'normal' | 'hurt'
    player(mode = 'normal') {
      const base = get('p:normal', () => rasterize(drawPaladin));
      if (mode === 'hurt') return get('p:hurt', () => tintCopy(createCanvas, base, PLAYER_PALETTE.hurt, 0.6));
      return base;
    },

    // Sombra elíptica genérica (no rota).
    shadow() {
      return get('shadow', () => {
        const { canvas, ctx } = makeCanvas(createCanvas, 64, 64);
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return canvas;
      });
    },

    // Halo luminoso del paladín (lo separa visualmente de la horda).
    halo() {
      return get('halo', () => {
        const { canvas, ctx } = makeCanvas(createCanvas, 128, 128);
        const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
        g.addColorStop(0, 'rgba(255, 236, 170, 0.32)');
        g.addColorStop(0.5, 'rgba(255, 214, 110, 0.12)');
        g.addColorStop(1, 'rgba(255, 214, 110, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        return canvas;
      });
    },

    // Puntito brillante genérico para chispas/brasas (blanco, se tiñe con globalAlpha).
    glowDot(color) {
      return get(`dot:${color}`, () => {
        const { canvas, ctx } = makeCanvas(createCanvas, 32, 32);
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, color);
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        return canvas;
      });
    },

    // Precalienta todos los sprites (12 demonios + jugador) para evitar tirones en el primer spawn.
    warm() {
      for (const type of Object.keys(VARIANT_PALETTES)) {
        for (let v = 0; v < VARIANT_PALETTES[type].length; v++) {
          api.enemy(type, v, 'normal');
          api.enemy(type, v, 'flash');
        }
      }
      api.player('normal');
      api.player('hurt');
      api.shadow();
      api.halo();
    },

    count() {
      return cache.size;
    },

    clear() {
      cache.clear();
    },
  };
  return api;
}
