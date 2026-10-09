// Enemigos: creación con escalado, IA por arquetipo, separación y contacto.
import { ENEMY_TYPES } from '../config.js';
import { clamp } from './math.js';
import { random, randomInt, randomRange } from './rng.js';
import { tryContactDamage } from './combat.js';

export function enemyHpMult(level, config) {
  return 1 + config.enemies.scaling.hpPerLevel * (level - 1);
}
export function enemyDamageMult(level, config) {
  return 1 + config.enemies.scaling.damagePerLevel * (level - 1);
}
export function enemySpeedMult(wave, config) {
  const sc = config.enemies.scaling;
  return Math.min(sc.speedMaxMult, 1 + sc.speedPerWave * (wave - 1));
}

/** Peso de aparición del tipo en la oleada dada (0 si aún no habilitado). */
export function spawnWeight(type, wave, config) {
  const w = config.enemies.spawnWeights[type];
  if (!w || wave < w.fromWave) return 0;
  return Math.max(0, Math.min(w.max, w.base + w.perWave * (wave - w.fromWave)));
}

export function pickEnemyType(state, wave, config) {
  let total = 0;
  for (let i = 0; i < ENEMY_TYPES.length; i++) total += spawnWeight(ENEMY_TYPES[i], wave, config);
  if (total <= 0) return ENEMY_TYPES[0];
  let r = random(state) * total;
  for (let i = 0; i < ENEMY_TYPES.length; i++) {
    r -= spawnWeight(ENEMY_TYPES[i], wave, config);
    if (r < 0) return ENEMY_TYPES[i];
  }
  return ENEMY_TYPES[ENEMY_TYPES.length - 1];
}

/** Crea un enemigo (no lo agrega) en (x, y) con stats escalados por nivel del jugador y oleada. */
export function makeEnemy(state, type, x, y, config) {
  const t = config.enemies.types[type];
  if (!t) throw new Error(`Tipo de enemigo desconocido: ${type}`);
  const level = state.player.level;
  const wave = state.wave ? state.wave.number : 1;
  const hp = t.hp * enemyHpMult(level, config);
  const isStalker = type === 'stalker';
  return {
    id: state.nextEnemyId++,
    type,
    variant: randomInt(state, config.enemies.variantsPerType),
    x, y,
    radius: t.radius,
    facing: Math.atan2(state.player.y - y, state.player.x - x),
    hp, maxHp: hp,
    damage: t.damage * enemyDamageMult(level, config),
    speed: t.speed * enemySpeedMult(wave, config),
    xp: t.xp,
    score: t.score,
    hurtTimer: 0,
    stunTimer: 0,
    contactTimer: 0,
    dashTimer: 0,
    dashCooldown: isStalker ? t.dashCooldown * randomRange(state, 0.4, 1) : 0,
    level,
    entered: x >= t.radius && x <= config.arena.width - t.radius && y >= t.radius && y <= config.arena.height - t.radius,
  };
}

/** Punto aleatorio en la periferia, fuera del borde por spawnOffset. */
export function randomSpawnPoint(state, config, out) {
  const { width: w, height: h, spawnOffset: off } = config.arena;
  const u = random(state) * (2 * w + 2 * h);
  if (u < w) { out.x = u; out.y = -off; }
  else if (u < 2 * w) { out.x = u - w; out.y = h + off; }
  else if (u < 2 * w + h) { out.x = -off; out.y = u - 2 * w; }
  else { out.x = w + off; out.y = u - 2 * w - h; }
  return out;
}

const _pt = { x: 0, y: 0 };

export function spawnEnemy(state, type, config) {
  randomSpawnPoint(state, config, _pt);
  const e = makeEnemy(state, type, _pt.x, _pt.y, config);
  state.enemies.push(e);
  state.stats.totalSpawned += 1;
  if (state.enemies.length > state.stats.maxAlive) state.stats.maxAlive = state.enemies.length;
  return e;
}

function isInside(e, config) {
  const r = e.radius;
  return e.x >= r && e.x <= config.arena.width - r && e.y >= r && e.y <= config.arena.height - r;
}

/** IA + separación + contacto. */
export function updateEnemies(state, dt, config) {
  const enemies = state.enemies;
  const p = state.player;
  const types = config.enemies.types;
  const W = config.arena.width, H = config.arena.height;
  const n = enemies.length;

  // 1) Movimiento por arquetipo.
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    if (e.hurtTimer > 0) e.hurtTimer = Math.max(0, e.hurtTimer - dt);
    if (e.contactTimer > 0) e.contactTimer = Math.max(0, e.contactTimer - dt);
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const touch = p.radius + e.radius;
    let speed = e.speed;
    let dirX, dirY;

    if (e.type === 'stalker') {
      const st = types.stalker;
      if (e.dashCooldown > 0) e.dashCooldown = Math.max(0, e.dashCooldown - dt);
      if (e.dashTimer > 0) {
        e.dashTimer = Math.max(0, e.dashTimer - dt);
        speed = e.speed * st.dashSpeedMult;
      } else {
        if (d > 1e-6) e.facing = Math.atan2(dy, dx);
        if (e.entered && d <= st.dashRange && d > touch && e.dashCooldown <= 0) {
          e.dashTimer = st.dashDuration;
          e.dashCooldown = st.dashCooldown;
          speed = e.speed * st.dashSpeedMult;
        }
      }
      dirX = Math.cos(e.facing);
      dirY = Math.sin(e.facing);
    } else {
      if (d > 1e-6) e.facing = Math.atan2(dy, dx);
      dirX = d > 1e-6 ? dx / d : 0;
      dirY = d > 1e-6 ? dy / d : 0;
    }

    let step = speed * dt;
    if (e.stunTimer > 0) {
      // Aturdido tras recibir un golpe: no avanza.
      e.stunTimer = Math.max(0, e.stunTimer - dt);
      step = 0;
    } else if (e.dashTimer <= 0) {
      // Persecución normal: no atravesar al jugador.
      const room = d - touch;
      if (room <= 0) step = 0;
      else if (step > room) step = room;
    }
    e.x += dirX * step;
    e.y += dirY * step;
  }

  // 2) Separación entre enemigos (O(n²) por iteración, aceptable para ~80).
  const strength = config.enemies.separationStrength * 0.5;
  const iterations = config.enemies.separationIterations || 1;
  for (let it = 0; it < iterations; it++) {
    pushOutOfPlayer(enemies, p);
    separatePass(enemies, strength);
  }

  // 3) No solapar al jugador, límites de arena (una vez dentro) y contacto.
  const contactRange = config.combat.contactRange || 0;
  for (let i = 0; i < n; i++) {
    const e = enemies[i];
    let dx = e.x - p.x, dy = e.y - p.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    const touch = p.radius + e.radius;
    if (d < touch) {
      if (d > 1e-6) { e.x = p.x + (dx / d) * touch; e.y = p.y + (dy / d) * touch; }
      else { e.x = p.x + Math.cos(e.facing + Math.PI) * touch; e.y = p.y + Math.sin(e.facing + Math.PI) * touch; }
      d = touch;
    }
    if (!e.entered && isInside(e, config)) e.entered = true;
    if (e.entered) {
      e.x = clamp(e.x, e.radius, W - e.radius);
      e.y = clamp(e.y, e.radius, H - e.radius);
      dx = e.x - p.x; dy = e.y - p.y;
      d = Math.sqrt(dx * dx + dy * dy);
    }
    if (d <= touch + contactRange && state.mode !== 'gameover') tryContactDamage(state, e, config);
  }
}

function pushOutOfPlayer(enemies, p) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dx = e.x - p.x, dy = e.y - p.y;
    const touch = p.radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= touch * touch || d2 < 1e-12) continue;
    const d = Math.sqrt(d2);
    e.x = p.x + (dx / d) * touch;
    e.y = p.y + (dy / d) * touch;
  }
}

function separatePass(enemies, strength) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2), nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; }
      else { const ang = ((a.id * 7 + b.id * 13) % 360) * (Math.PI / 180); nx = Math.cos(ang); ny = Math.sin(ang); d = 0; }
      const push = (rr - d) * strength;
      // Los más grandes ceden menos (masa ~ radio²).
      const ma = a.radius * a.radius, mb = b.radius * b.radius;
      const fa = mb / (ma + mb), fb = ma / (ma + mb);
      a.x -= nx * push * 2 * fa; a.y -= ny * push * 2 * fa;
      b.x += nx * push * 2 * fb; b.y += ny * push * 2 * fb;
    }
  }
}
