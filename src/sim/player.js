// Jugador: stats efectivos, movimiento, XP y niveles.
import { ATTRIBUTE_KEYS } from '../config.js';
import { clamp } from './math.js';
import { addEffect } from './effects.js';

export function baseStat(key, config) {
  const p = config.player;
  switch (key) {
    case 'maxHp': return p.baseMaxHp;
    case 'attack': return p.baseAttack;
    case 'defense': return p.baseDefense;
    case 'speed': return p.baseSpeed;
    case 'attackSpeed': return p.baseAttackSpeed;
    default: throw new Error(`Atributo desconocido: ${key}`);
  }
}

export function statCap(key, config) {
  if (key === 'speed') return config.player.maxSpeed;
  if (key === 'attackSpeed') return config.player.maxAttackSpeed;
  return Infinity;
}

/** Stat efectivo = base * (1 + pasivo * (nivel-1) + manual * puntos), con cap. */
export function computeStat(key, level, points, config) {
  const prog = config.progression;
  const mult = 1 + prog.passivePerLevel[key] * (level - 1) + prog.manualPerPoint[key] * points;
  return Math.min(statCap(key, config), baseStat(key, config) * mult);
}

export function xpToNext(level, config) {
  const prog = config.progression;
  return Math.max(1, Math.round(prog.xpBase * Math.pow(prog.xpGrowth, level - 1)));
}

export function createPlayer(config) {
  const p = config.player;
  const player = {
    x: config.arena.width / 2,
    y: config.arena.height / 2,
    radius: p.radius,
    facing: 0,
    hp: 0, maxHp: 0, attack: 0, defense: 0, speed: 0, attackSpeed: 0,
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1, config),
    pendingPoints: 0,
    pointsSpent: { maxHp: 0, attack: 0, defense: 0, speed: 0, attackSpeed: 0 },
    invulnTimer: 0,
    hurtTimer: 0,
    vx: 0,
    vy: 0,
  };
  recomputePlayerStats(player, config);
  player.hp = player.maxHp;
  return player;
}

/** Recalcula todos los stats efectivos. Si maxHp sube, cura la diferencia. */
export function recomputePlayerStats(player, config) {
  const oldMax = player.maxHp;
  for (let i = 0; i < ATTRIBUTE_KEYS.length; i++) {
    const k = ATTRIBUTE_KEYS[i];
    player[k] = computeStat(k, player.level, player.pointsSpent[k], config);
  }
  if (oldMax > 0 && player.maxHp > oldMax) player.hp += player.maxHp - oldMax;
  if (player.hp > player.maxHp) player.hp = player.maxHp;
}

export function updatePlayerTimers(player, dt) {
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);
}

export function updateFacing(player, input) {
  if (!input) return;
  const ax = input.aimX, ay = input.aimY;
  if (typeof ax !== 'number' || typeof ay !== 'number' || !Number.isFinite(ax) || !Number.isFinite(ay)) return;
  const dx = ax - player.x, dy = ay - player.y;
  if (dx === 0 && dy === 0) return;
  player.facing = Math.atan2(dy, dx);
}

/** Movimiento WASD normalizado (diagonal no más rápida) con clamp a la arena. */
export function movePlayer(player, input, dt, config) {
  let mx = input ? clamp(Number(input.moveX) || 0, -1, 1) : 0;
  let my = input ? clamp(Number(input.moveY) || 0, -1, 1) : 0;
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1e-9) {
    const inv = len > 1 ? 1 / len : 1;
    mx *= inv;
    my *= inv;
  }
  player.vx = mx * player.speed;
  player.vy = my * player.speed;
  const r = player.radius;
  player.x = clamp(player.x + player.vx * dt, r, config.arena.width - r);
  player.y = clamp(player.y + player.vy * dt, r, config.arena.height - r);
}

/**
 * Suma XP; sube de nivel tantas veces como corresponda sin perder el sobrante.
 * Cada nivel: pasivo a todos los stats + pointsPerLevel. Devuelve niveles ganados.
 */
export function grantXp(state, amount, config) {
  const player = state.player;
  if (amount > 0) player.xp += amount;
  let gained = 0;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = xpToNext(player.level, config);
    player.pendingPoints += config.progression.pointsPerLevel;
    recomputePlayerStats(player, config);
    const heal = config.progression.levelUpHealFraction || 0;
    if (heal > 0) player.hp = Math.min(player.maxHp, player.hp + player.maxHp * heal);
    gained++;
    state.events.push({ type: 'levelUp', level: player.level, pendingPoints: player.pendingPoints });
    addEffect(state, 'levelUp', player.x, player.y, config);
  }
  if (gained > 0 && player.pendingPoints > 0 && state.mode === 'playing') state.mode = 'levelup';
  return gained;
}
