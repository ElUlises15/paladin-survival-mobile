// Paladin Survival RPG — renderer Canvas 2D.
// Contrato (docs/INTERFACES.md):
//   createRenderer(canvas, config = CONFIG, options?) → { render(state, nowSeconds), destroy() }
//   VARIANT_PALETTES
// Solo LEE `state`; nunca lo muta. Todo el arte es procedural y se cachea en canvas offscreen.
//
// options.createCanvas(width, height) → canvas-like ({ width, height, getContext('2d') })
//   Permite inyectar un factory (tests en Node). Por defecto usa OffscreenCanvas o document.createElement.

import { CONFIG } from '../config.js';
import {
  VARIANT_PALETTES,
  PLAYER_PALETTE,
  EFFECT_COLORS,
  getEnemyPalette,
  getSwordStyle,
  withAlpha,
} from './palettes.js';
import { createSpriteCache, defaultCreateCanvas } from './sprites.js';
import { buildArenaCanvas, buildDamageVignette } from './arena.js';

export { VARIANT_PALETTES };

const TAU = Math.PI * 2;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Hash determinista [0,1) para variar chispas/humo sin Math.random (estable entre frames).
function hash01(a, b, i) {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (i * 83492791), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

// Progreso 0..1 de un efecto. Convención asumida: `t` = tiempo transcurrido desde que nació (0 → duration).
function effectProgress(e) {
  const d = num(e.duration, 0);
  if (d <= 0) return 1;
  return clamp01(num(e.t, 0) / d);
}

// Sector de anillo (annulus) entre radios r0..r1 y ángulos a0..a1.
function annulusPath(ctx, x, y, r0, r1, a0, a1) {
  ctx.beginPath();
  ctx.arc(x, y, r1, a0, a1, false);
  ctx.arc(x, y, r0, a1, a0, true);
  ctx.closePath();
}

export function createRenderer(canvas, config = CONFIG, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('createRenderer: canvas inválido');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createRenderer: no se pudo obtener contexto 2d');

  const createCanvas = options.createCanvas || defaultCreateCanvas;
  const W = num(config?.arena?.width, 1440);
  const H = num(config?.arena?.height, 810);
  const typeRadius = (type) => num(config?.enemies?.types?.[type]?.radius, 16);

  const sprites = createSpriteCache(createCanvas);
  let arenaCanvas = buildArenaCanvas(createCanvas, W, H, 1337);
  let damageVignette = null; // lazy
  let destroyed = false;

  try {
    sprites.warm();
  } catch (err) {
    // Si el precalentado falla (contexto raro), los sprites se generan bajo demanda.
  }

  const R = sprites.refRadius;
  const HALF = sprites.half;

  // Vista (móvil): escala uniforme + traslación aplicada sobre las coords de arena.
  // Por defecto identidad → el canvas de escritorio 1440×810 se dibuja exactamente igual que en v0.1.
  let vs = 1, vtx = 0, vty = 0, viewIdentity = true;
  let lowFx = false;
  let fxHit = 7, fxSmoke = 6, fxEmbers = 8, fxSparks = 10;
  function T(a, b, c, d, e, f) {
    if (viewIdentity) ctx.setTransform(a, b, c, d, e, f);
    else ctx.setTransform(a * vs, b * vs, c * vs, d * vs, e * vs + vtx, f * vs + vty);
  }
  function setView(scale = 1, offsetX = 0, offsetY = 0) {
    vs = num(scale, 1) > 0 ? num(scale, 1) : 1;
    vtx = num(offsetX, 0);
    vty = num(offsetY, 0);
    viewIdentity = vs === 1 && vtx === 0 && vty === 0;
  }
  function setLowFx(on) {
    lowFx = !!on;
    fxHit = lowFx ? 4 : 7;
    fxSmoke = lowFx ? 3 : 6;
    fxEmbers = lowFx ? 4 : 8;
    fxSparks = lowFx ? 5 : 10;
  }

  function resetTransform() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Dibuja un sprite cacheado centrado en (x, y), rotado por `angle`, escalado a `radius`.
  function drawSprite(img, x, y, angle, radius) {
    const s = radius / R;
    const c = Math.cos(angle) * s;
    const sn = Math.sin(angle) * s;
    T(c, sn, -sn, c, x, y);
    ctx.drawImage(img, -HALF, -HALF);
  }

  function drawShadow(x, y, radius, alpha = 1) {
    const img = sprites.shadow();
    const w = radius * 2.6;
    const h = radius * 1.5;
    T(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - w / 2, y - h / 2 + radius * 0.45, w, h);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Enemigos
  // ---------------------------------------------------------------------------

  function drawEnemies(enemies, now) {
    // Sombras primero (una pasada) para que no tapen a otros enemigos.
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      drawShadow(num(e.x), num(e.y), num(e.radius, typeRadius(e.type)), 0.9);
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = num(e.x);
      const y = num(e.y);
      const radius = num(e.radius, typeRadius(e.type));
      const facing = num(e.facing);

      // Estela del acechador durante el dash
      if (e.type === 'stalker' && num(e.dashTimer) > 0) {
        const ghost = sprites.enemy(e.type, e.variant, 'ghost');
        const dx = Math.cos(facing);
        const dy = Math.sin(facing);
        for (let k = 3; k >= 1; k--) {
          ctx.globalAlpha = 0.42 - k * 0.11;
          drawSprite(ghost, x - dx * radius * 0.85 * k, y - dy * radius * 0.85 * k, facing, radius);
        }
        ctx.globalAlpha = 1;
      }

      // Leve "respiración" para que no se vean estáticos (desfasada por id).
      const wob = 1 + Math.sin(now * 9 + num(e.id) * 1.7) * 0.03;
      drawSprite(sprites.enemy(e.type, e.variant, 'normal'), x, y, facing, radius * wob);

      if (num(e.hurtTimer) > 0) {
        const flashT = num(config?.combat?.enemyHurtFlashTime, 0.15);
        ctx.globalAlpha = 0.35 + 0.65 * clamp01(num(e.hurtTimer) / flashT);
        drawSprite(sprites.enemy(e.type, e.variant, 'flash'), x, y, facing, radius * wob);
        ctx.globalAlpha = 1;
      }
    }
    T(1, 0, 0, 1, 0, 0);
  }

  function drawEnemyBars(enemies) {
    T(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const hp = num(e.hp);
      const maxHp = num(e.maxHp, 1);
      if (!(hp < maxHp) || hp <= 0 || maxHp <= 0) continue;
      const radius = num(e.radius, typeRadius(e.type));
      const w = Math.max(18, radius * 1.8);
      const h = 4;
      const bx = Math.round(num(e.x) - w / 2);
      const by = Math.round(num(e.y) - radius * 1.5 - 7);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = '#4a0d0d';
      ctx.fillRect(bx, by, w, h);
      const f = clamp01(hp / maxHp);
      ctx.fillStyle = f > 0.5 ? '#e8503a' : f > 0.25 ? '#f08a24' : '#ffd23f';
      ctx.fillRect(bx, by, w * f, h);
    }
  }

  // ---------------------------------------------------------------------------
  // Jugador y espada
  // ---------------------------------------------------------------------------

  function drawSwordShape(x, y, angle, length, style, tier, now) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    T(c, s, -s, c, x, y);
    const bladeStart = 14;
    const bw = 3.2 + tier * 0.45; // medio ancho de hoja
    const L = Math.max(bladeStart + 10, length);

    // Halo de la hoja (larga y rúnica)
    if (style.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(style.glow, tier >= 3 ? 0.28 + 0.1 * Math.sin(now * 8) : 0.16);
      ctx.beginPath();
      ctx.moveTo(bladeStart - 2, -bw - 4);
      ctx.lineTo(L - 6, -bw - 2);
      ctx.lineTo(L + 6, 0);
      ctx.lineTo(L - 6, bw + 2);
      ctx.lineTo(bladeStart - 2, bw + 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Hoja
    ctx.fillStyle = style.blade;
    ctx.strokeStyle = PLAYER_PALETTE.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bladeStart, -bw);
    ctx.lineTo(L - bw * 2.4, -bw * 0.85);
    ctx.lineTo(L, 0);
    ctx.lineTo(L - bw * 2.4, bw * 0.85);
    ctx.lineTo(bladeStart, bw);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Filo / canal brillante
    ctx.strokeStyle = style.edge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bladeStart + 2, -bw * 0.25);
    ctx.lineTo(L - bw * 2, -bw * 0.15);
    ctx.stroke();

    // Runas en la espada rúnica
    if (tier >= 3) {
      ctx.strokeStyle = '#c38bff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const rx = bladeStart + 8 + k * ((L - bladeStart - 22) / 4);
        ctx.moveTo(rx, -bw * 0.5);
        ctx.lineTo(rx + 3, bw * 0.5);
        ctx.moveTo(rx + 3, -bw * 0.5);
        ctx.lineTo(rx + 5, 0);
      }
      ctx.stroke();
    }

    // Guarda
    ctx.fillStyle = style.guard;
    ctx.strokeStyle = PLAYER_PALETTE.outline;
    ctx.lineWidth = 1;
    ctx.fillRect(bladeStart - 4, -bw - 6, 4, (bw + 6) * 2);
    ctx.strokeRect(bladeStart - 4, -bw - 6, 4, (bw + 6) * 2);
    // Empuñadura
    ctx.fillStyle = style.hilt;
    ctx.fillRect(0, -2, bladeStart - 4, 4);
    // Pomo dorado
    ctx.fillStyle = PLAYER_PALETTE.gold;
    ctx.beginPath();
    ctx.arc(-1, 0, 3, 0, TAU);
    ctx.fill();
  }

  function drawSwing(player, sword, style, now) {
    const swingTimer = num(sword.swingTimer);
    const dur = num(sword.swingDuration, num(config?.sword?.swingDuration, 0.16));
    if (swingTimer <= 0 || dur <= 0) return null;
    const p = clamp01(1 - swingTimer / dur);
    const eased = 1 - (1 - p) * (1 - p);
    const half = (num(sword.arcDeg, 100) * Math.PI) / 360;
    const center = num(sword.swingAngle, num(player.facing));
    const a0 = center - half;
    const cur = a0 + 2 * half * eased;
    const range = num(sword.range, 72);
    const px = num(player.x);
    const py = num(player.y);
    const pr = num(player.radius, 18);
    const inner = Math.max(pr * 0.6, range * 0.35);
    const fade = p < 0.75 ? 1 : (1 - p) / 0.25;

    T(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';

    // Sector completo tenue: muestra alcance y apertura reales del golpe.
    ctx.globalAlpha = 0.12 * fade;
    ctx.fillStyle = style.trail;
    annulusPath(ctx, px, py, pr * 0.6, range, a0, a0 + 2 * half);
    ctx.fill();

    // Estela: segmentos con alfa creciente hacia la posición actual de la hoja.
    const span = cur - a0;
    if (span > 0.001) {
      const N = 12;
      ctx.fillStyle = style.trail;
      for (let i = 0; i < N; i++) {
        const s0 = a0 + (span * i) / N;
        const s1 = a0 + (span * (i + 1)) / N;
        ctx.globalAlpha = 0.5 * ((i + 1) / N) * ((i + 1) / N) * fade;
        annulusPath(ctx, px, py, inner, range, s0, s1);
        ctx.fill();
      }
      // Núcleo brillante cerca del filo
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = style.trailCore;
      annulusPath(ctx, px, py, range * 0.82, range, Math.max(a0, cur - span * 0.35), cur);
      ctx.fill();
      // Borde exterior brillante
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = style.trailCore;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(px, py, range, Math.max(a0, cur - span * 0.6), cur);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return cur;
  }

  function drawPlayer(state, now) {
    const player = state.player;
    if (!player) return;
    const sword = state.sword || {};
    const tier = Math.max(0, Math.min(3, Math.floor(num(sword.tier))));
    const style = getSwordStyle(tier);
    const x = num(player.x, W / 2);
    const y = num(player.y, H / 2);
    const radius = num(player.radius, 18);
    const facing = num(player.facing);
    const moving = Math.hypot(num(player.vx), num(player.vy)) > 5;
    const bob = moving ? Math.sin(now * 14) : 0;
    const dead = num(player.hp, 1) <= 0;

    // Halo dorado + sombra
    T(1, 0, 0, 1, 0, 0);
    const halo = sprites.halo();
    const hs = radius * 5.2;
    ctx.globalAlpha = dead ? 0.3 : 0.85 + 0.15 * Math.sin(now * 3);
    ctx.drawImage(halo, x - hs / 2, y - hs / 2, hs, hs);
    ctx.globalAlpha = 1;
    drawShadow(x, y, radius, 1);

    // Barrido de la espada (debajo del cuerpo)
    const swingAngle = drawSwing(player, sword, style, now);

    // Transparencia intermitente durante invulnerabilidad
    let alpha = 1;
    if (num(player.invulnTimer) > 0 && Math.floor(now * 16) % 2 === 0) alpha = 0.45;
    if (dead) alpha = 0.5;

    // Espada
    const range = num(sword.range, 72);
    ctx.globalAlpha = alpha;
    if (swingAngle !== null) {
      const bx = x + Math.cos(swingAngle) * radius * 0.45;
      const by = y + Math.sin(swingAngle) * radius * 0.45;
      drawSwordShape(bx, by, swingAngle, range - radius * 0.45, style, tier, now);
    }

    // Cuerpo del paladín (bob leve al moverse)
    const hurt = num(player.hurtTimer) > 0 && Math.floor(now * 20) % 2 === 0;
    const img = sprites.player(hurt ? 'hurt' : 'normal');
    const by = y + bob * 1.6;
    drawSprite(img, x, by, facing, radius * (1 + bob * 0.025));

    // Espada en reposo en la mano derecha apuntando a facing
    if (swingAngle === null) {
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      const hx = x + c * radius * 0.35 - s * radius * 0.78;
      const hy = by + s * radius * 0.35 + c * radius * 0.78;
      drawSwordShape(hx, hy, facing, range * 0.72, style, tier, now);
    }
    ctx.globalAlpha = 1;
    T(1, 0, 0, 1, 0, 0);

    // Indicador sutil de cooldown (arco bajo el jugador)
    const cd = num(sword.cooldown);
    const cdt = num(sword.cooldownTimer);
    if (cd > 0 && cdt > 0 && !dead) {
      const f = clamp01(1 - cdt / cd);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, radius + 9, Math.PI * 0.25, Math.PI * 0.75);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(style.trail, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, radius + 9, Math.PI * 0.75 - Math.PI * 0.5 * f, Math.PI * 0.75);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Efectos
  // ---------------------------------------------------------------------------

  function drawEffects(state, now) {
    const effects = state.effects;
    if (!Array.isArray(effects) || effects.length === 0) return 0;
    const swordStyle = getSwordStyle(Math.floor(num(state.sword?.tier)));
    let playerHitAlpha = 0;
    T(1, 0, 0, 1, 0, 0);

    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (!e) continue;
      const p = effectProgress(e);
      if (p >= 1) continue;
      const x = num(e.x);
      const y = num(e.y);
      const ix = Math.round(x) | 0;
      const iy = Math.round(y) | 0;
      const q = 1 - p;

      switch (e.kind) {
        case 'hit': {
          ctx.globalCompositeOperation = 'lighter';
          // Destello central
          const dot = sprites.glowDot(EFFECT_COLORS.hit);
          const ds = 34 * q + 8;
          ctx.globalAlpha = q;
          ctx.drawImage(dot, x - ds / 2, y - ds / 2, ds, ds);
          // Chispas radiales
          ctx.strokeStyle = EFFECT_COLORS.hit;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let k = 0; k < fxHit; k++) {
            const a = hash01(ix, iy, k) * TAU;
            const sp = 0.6 + hash01(iy, ix, k + 11) * 0.8;
            const d0 = 4 + p * 26 * sp;
            const d1 = d0 + 9 * q * sp;
            ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
            ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
          }
          ctx.stroke();
          break;
        }
        case 'death': {
          const type = VARIANT_PALETTES[e.type] ? e.type : 'minor';
          const pal = getEnemyPalette(type, e.variant);
          const sc = typeRadius(type) / 16;
          // Humo oscuro
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = EFFECT_COLORS.smoke;
          for (let k = 0; k < fxSmoke; k++) {
            const a = hash01(ix, iy, k + 3) * TAU;
            const d = p * 26 * sc * (0.5 + hash01(ix, iy, k + 21));
            ctx.globalAlpha = 0.55 * q;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - p * 10, (5 + p * 13) * sc, 0, TAU);
            ctx.fill();
          }
          // Llamarada del color de la variante
          ctx.globalCompositeOperation = 'lighter';
          const dot = sprites.glowDot(pal.glow);
          const ds = (30 + p * 40) * sc;
          ctx.globalAlpha = q * q;
          ctx.drawImage(dot, x - ds / 2, y - ds / 2, ds, ds);
          ctx.globalAlpha = q;
          ctx.strokeStyle = pal.glow;
          ctx.lineWidth = 3 * q + 1;
          ctx.beginPath();
          ctx.arc(x, y, (8 + p * 34) * sc, 0, TAU);
          ctx.stroke();
          // Brasas
          ctx.fillStyle = pal.eye;
          for (let k = 0; k < fxEmbers; k++) {
            const a = hash01(ix, iy, k + 40) * TAU;
            const d = (6 + p * 40 * (0.5 + hash01(iy, ix, k))) * sc;
            ctx.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1 - p * 14, 2.2, 2.2);
          }
          break;
        }
        case 'playerHit': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = q;
          ctx.strokeStyle = EFFECT_COLORS.playerHit;
          ctx.lineWidth = 4 * q + 1;
          ctx.beginPath();
          ctx.arc(x, y, 18 + p * 32, 0, TAU);
          ctx.stroke();
          playerHitAlpha = Math.max(playerHitAlpha, q);
          break;
        }
        case 'levelUp': {
          ctx.globalCompositeOperation = 'lighter';
          // Columna de luz
          ctx.globalAlpha = 0.35 * q;
          ctx.fillStyle = EFFECT_COLORS.levelUpCore;
          const cw = 34 * (0.6 + q * 0.4);
          ctx.fillRect(x - cw / 2, y - 140 * Math.min(1, p * 3), cw, 140 * Math.min(1, p * 3));
          // Dos anillos dorados
          for (let k = 0; k < 2; k++) {
            const pk = clamp01(p * 1.3 - k * 0.25);
            if (pk <= 0 || pk >= 1) continue;
            ctx.globalAlpha = 1 - pk;
            ctx.strokeStyle = k === 0 ? EFFECT_COLORS.levelUp : EFFECT_COLORS.levelUpCore;
            ctx.lineWidth = 6 * (1 - pk) + 1;
            ctx.beginPath();
            ctx.arc(x, y, 20 + pk * 110, 0, TAU);
            ctx.stroke();
          }
          // Chispas ascendentes
          ctx.fillStyle = EFFECT_COLORS.levelUp;
          ctx.globalAlpha = q;
          for (let k = 0; k < fxSparks; k++) {
            const a = hash01(ix, iy, k + 70) * TAU;
            const d = 16 + hash01(iy, ix, k + 5) * 30;
            ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5 - p * 70, 2.5, 5);
          }
          break;
        }
        case 'swordUp': {
          ctx.globalCompositeOperation = 'lighter';
          const color = swordStyle.glow || EFFECT_COLORS.swordUp;
          ctx.globalAlpha = q;
          ctx.strokeStyle = color;
          ctx.lineWidth = 5 * q + 1;
          ctx.beginPath();
          ctx.arc(x, y, 24 + p * 90, 0, TAU);
          ctx.stroke();
          // Estrella de 8 rayos
          ctx.strokeStyle = swordStyle.trailCore;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU + now * 1.5;
            const d0 = 14 + p * 30;
            const d1 = d0 + 26 * q;
            ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
            ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
          }
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return playerHitAlpha;
  }

  function drawDamageVignette(alpha) {
    if (alpha <= 0) return;
    if (!damageVignette) damageVignette = buildDamageVignette(createCanvas, W, H);
    T(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * 0.55;
    ctx.drawImage(damageVignette, 0, 0);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  function render(state, nowSeconds) {
    if (destroyed) return;
    const now = num(nowSeconds, 0);
    resetTransform();
    if (!viewIdentity) {
      // Fondo fuera de la arena (la vista móvil puede mostrar más que la arena).
      ctx.fillStyle = '#07060a';
      ctx.fillRect(0, 0, num(canvas.width, 0), num(canvas.height, 0));
    }
    T(1, 0, 0, 1, 0, 0);
    ctx.drawImage(arenaCanvas, 0, 0);
    if (!state) { resetTransform(); return; }

    const enemies = Array.isArray(state.enemies) ? state.enemies : [];
    drawEnemies(enemies, now);
    drawPlayer(state, now);
    const hitAlpha = drawEffects(state, now);
    drawEnemyBars(enemies);
    // Viñeta roja mientras el jugador está herido
    const hurtFlash = num(config?.player?.hurtFlashTime, 0.25);
    const hurtAlpha = state.player ? clamp01(num(state.player.hurtTimer) / hurtFlash) : 0;
    drawDamageVignette(Math.max(hitAlpha, hurtAlpha));
    resetTransform();
  }

  function destroy() {
    destroyed = true;
    sprites.clear();
    arenaCanvas = null;
    damageVignette = null;
  }

  return { render, destroy, setView, setLowFx, get lowFx() { return lowFx; } };
}
