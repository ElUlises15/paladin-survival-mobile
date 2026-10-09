// API pública de la simulación (ver docs/INTERFACES.md). Sin DOM, sin Math.random, sin Date.
import { CONFIG, ATTRIBUTE_KEYS, ENEMY_TYPES } from '../config.js';
import { seedToRngState } from './rng.js';
import {
  createPlayer, recomputePlayerStats, updatePlayerTimers, updateFacing, movePlayer, grantXp, xpToNext,
} from './player.js';
import { createSword, recomputeSword, updateSword, computeDamageTaken } from './combat.js';
import { updateEnemies } from './enemies.js';
import { createWaveState, updateWaves, waveEnemyCount } from './waves.js';
import { scoreKill, updateTimeScore } from './score.js';
import { addEffect, updateEffects } from './effects.js';

export { xpToNext, waveEnemyCount, computeDamageTaken };
export { computeStat, grantXp, recomputePlayerStats } from './player.js';
export { swordTierForKills, isInSwordArc, recomputeSword } from './combat.js';
export { makeEnemy, spawnEnemy, pickEnemyType, spawnWeight, enemyHpMult, enemyDamageMult, enemySpeedMult } from './enemies.js';
export { createWaveState, startNextWave, scheduledTarget } from './waves.js';
export { killPoints, timeActivityMult } from './score.js';

export const MAX_STEP = 1 / 60;
const DEFAULT_SEED = 0x5eed1234;

export function createGame(config = CONFIG, { seed } = {}) {
  const s = seed === undefined || seed === null ? DEFAULT_SEED : seed;
  const state = {
    mode: 'playing',
    seed: s,
    rngState: seedToRngState(s),
    time: 0,
    kills: 0,
    score: 0,
    scoreDetail: { kills: 0, time: 0 },
    lastKillTime: -Infinity,
    nextEnemyId: 1,
    player: createPlayer(config),
    sword: createSword(config),
    enemies: [],
    wave: null,
    spawnQueue: 0,
    effects: [],
    events: [],
    stats: { maxAlive: 0, totalSpawned: 0, totalScheduled: 0 },
  };
  state.wave = createWaveState(1, config);
  recomputeSword(state, config);
  return state;
}

function syncSwordTier(state, config) {
  if (recomputeSword(state, config)) {
    const s = state.sword;
    state.events.push({ type: 'swordUpgrade', tier: s.tier, name: s.name });
    addEffect(state, 'swordUp', state.player.x, state.player.y, config);
  }
}

function onKill(state, e, config) {
  state.kills += 1;
  state.lastKillTime = state.time;
  const pts = scoreKill(state, e, config);
  state.events.push({ type: 'kill', enemyId: e.id, enemyType: e.type, variant: e.variant, x: e.x, y: e.y, score: pts, xp: e.xp });
  addEffect(state, 'death', e.x, e.y, config, e.type, e.variant);
  syncSwordTier(state, config);
  if (grantXp(state, e.xp, config) > 0) recomputeSword(state, config);
}

function processDeaths(state, config) {
  const arr = state.enemies;
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.hp <= 0) onKill(state, e, config);
    else arr[w++] = e;
  }
  arr.length = w;
}

function step(state, dt, input, config) {
  // Coherencia aunque kills/xp se hayan asignado desde fuera (tests, herramientas de QA).
  syncSwordTier(state, config);
  if (grantXp(state, 0, config) > 0) recomputeSword(state, config);
  if (state.mode !== 'playing') return;
  state.time += dt;
  const p = state.player;
  updatePlayerTimers(p, dt);
  updateFacing(p, input, state.enemies);
  movePlayer(p, input, dt, config);

  updateSword(state, input, dt, config);
  processDeaths(state, config);
  if (state.mode !== 'playing') { updateEffects(state, dt); return; } // levelup pausa el resto del paso

  updateWaves(state, dt, config);
  updateEnemies(state, dt, config);

  if (state.mode !== 'gameover') updateTimeScore(state, dt, config);
  updateEffects(state, dt);
  if (state.enemies.length > state.stats.maxAlive) state.stats.maxAlive = state.enemies.length;
}

/** Avanza la simulación dt segundos (subdividido en pasos ≤ 1/60). Solo actúa en mode 'playing'. */
// Fuera de 'playing' es un NO-OP total (ni siquiera vacía events) para que pausa/levelup/gameover
// congelen el estado exactamente.
export function updateGame(state, dt, input, config = CONFIG) {
  if (state.mode !== 'playing') return;
  state.events.length = 0;
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    step(state, h, input, config);
    if (state.mode !== 'playing') break;
  }
}

/** Aplica exactamente un punto manual. Solo en 'levelup' con puntos pendientes y clave válida. */
export function chooseAttribute(state, key, config = CONFIG) {
  if (!state || state.mode !== 'levelup') return false;
  if (ATTRIBUTE_KEYS.indexOf(key) === -1) return false;
  const p = state.player;
  if (!(p.pendingPoints > 0)) return false;
  p.pointsSpent[key] += 1;
  p.pendingPoints -= 1;
  recomputePlayerStats(p, config);
  recomputeSword(state, config);
  if (p.pendingPoints <= 0) {
    p.pendingPoints = 0;
    state.mode = 'playing';
  }
  return true;
}

export function setPaused(state, paused) {
  if (paused && state.mode === 'playing') state.mode = 'paused';
  else if (!paused && state.mode === 'paused') state.mode = 'playing';
}

function num(v) {
  return Number.isFinite(v) ? v : null;
}

/** Copia plana JSON-serializable del estado (nunca referencias mutables). */
export function getDiagnostics(state) {
  const p = state.player, s = state.sword, w = state.wave;
  const countsByType = {};
  for (let i = 0; i < ENEMY_TYPES.length; i++) countsByType[ENEMY_TYPES[i]] = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const t = state.enemies[i].type;
    countsByType[t] = (countsByType[t] || 0) + 1;
  }
  return {
    mode: state.mode,
    seed: state.seed,
    time: state.time,
    wave: w.number,
    waveInfo: { number: w.number, total: w.total, scheduled: w.scheduled, timer: w.timer, clearedTimer: w.clearedTimer },
    enemiesAlive: state.enemies.length,
    spawnQueue: state.spawnQueue,
    countsByType,
    kills: state.kills,
    score: state.score,
    scoreDetail: { kills: state.scoreDetail.kills, time: state.scoreDetail.time },
    lastKillTime: num(state.lastKillTime),
    player: {
      x: p.x, y: p.y, radius: p.radius, facing: p.facing,
      hp: p.hp, maxHp: p.maxHp, attack: p.attack, defense: p.defense, speed: p.speed, attackSpeed: p.attackSpeed,
      level: p.level, xp: p.xp, xpToNext: p.xpToNext, pendingPoints: p.pendingPoints,
      pointsSpent: { ...p.pointsSpent },
      invulnTimer: p.invulnTimer, hurtTimer: p.hurtTimer, vx: p.vx, vy: p.vy,
    },
    sword: {
      tier: s.tier, name: s.name, damage: s.damage, range: s.range, arcDeg: s.arcDeg,
      cooldown: s.cooldown, cooldownTimer: s.cooldownTimer, swingTimer: s.swingTimer,
      swingDuration: s.swingDuration, swingAngle: s.swingAngle, swingId: s.swingId, hitIds: s.hitIds.slice(),
    },
    effects: state.effects.length,
    events: state.events.length,
    stats: { maxAlive: state.stats.maxAlive, totalSpawned: state.stats.totalSpawned, totalScheduled: state.stats.totalScheduled },
  };
}
