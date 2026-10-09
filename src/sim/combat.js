// Combate: espada del jugador, daño recibido, contacto enemigo.
import { angleDiff, degToRad, clamp } from './math.js';
import { addEffect } from './effects.js';

/**
 * Daño recibido = max(minDamage, raw * minDamageFraction, raw * K / (K + defense)).
 * Siempre positivo para raw > 0 (nunca invulnerabilidad absoluta).
 */
export function computeDamageTaken(raw, defense, config) {
  const c = config.combat;
  if (!(raw > 0)) return 0;
  const def = defense > 0 ? defense : 0;
  const reduced = (raw * c.defenseK) / (c.defenseK + def);
  return Math.max(c.minDamage, raw * c.minDamageFraction, reduced);
}

export function swordTierForKills(kills, config) {
  const tiers = config.sword.tiers;
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (kills >= tiers[i].killsRequired) tier = i;
  return tier;
}

export function createSword(config) {
  return {
    tier: 0, name: '', damage: 0, range: 0, arcDeg: 0,
    cooldown: 0, cooldownTimer: 0,
    swingTimer: 0, swingDuration: config.sword.swingDuration, swingAngle: 0,
    swingId: 0, hitIds: [],
  };
}

/** Recalcula los valores derivados de la espada. Devuelve true si subió de tier. */
export function recomputeSword(state, config) {
  const s = state.sword, p = state.player;
  const prevTier = s.tier;
  const tier = swordTierForKills(state.kills, config);
  const t = config.sword.tiers[tier];
  s.tier = tier;
  s.name = t.name;
  s.damage = p.attack * t.damageMult;
  s.range = t.range;
  s.arcDeg = t.arcDeg;
  s.cooldown = 1 / p.attackSpeed;
  s.swingDuration = config.sword.swingDuration;
  return tier > prevTier;
}

/** ¿El enemigo está dentro del sector activo de la espada? */
export function isInSwordArc(state, enemy) {
  const s = state.sword, p = state.player;
  const dx = enemy.x - p.x, dy = enemy.y - p.y;
  const d2 = dx * dx + dy * dy;
  const reach = s.range + enemy.radius;
  if (d2 > reach * reach) return false;
  const d = Math.sqrt(d2);
  // Solapamiento real (1 px de tolerancia: un enemigo apoyado exactamente en el borde no cuenta).
  if (d < p.radius + enemy.radius - 1) return true;
  return angleDiff(Math.atan2(dy, dx), s.swingAngle) <= degToRad(s.arcDeg) / 2;
}

/**
 * Timers de espada, inicio de swing y evaluación de golpes.
 * Enemigos con hp <= 0 quedan en el array para que game.js procese la muerte.
 */
export function updateSword(state, input, dt, config) {
  const s = state.sword, p = state.player;
  if (s.cooldownTimer > 0) s.cooldownTimer -= dt;
  if (s.swingTimer > 0) s.swingTimer = Math.max(0, s.swingTimer - dt);

  // Durante el Giro no se inicia un golpe normal (la espada está girando).
  const spinning = !!(state.spin && state.spin.timer > 0);
  if (input && input.attack && s.cooldownTimer <= 0 && !spinning) {
    // Arrastre acotado del sobrante para que el ritmo no dependa del tamaño del paso.
    const carry = s.cooldownTimer > -dt ? s.cooldownTimer : 0;
    s.cooldownTimer = s.cooldown + carry;
    s.swingTimer = s.swingDuration;
    s.swingAngle = p.facing;
    s.swingId += 1;
    s.hitIds.length = 0;
    state.events.push({ type: 'swing', swingId: s.swingId, angle: s.swingAngle, x: p.x, y: p.y, tier: s.tier });
  }

  if (s.swingTimer <= 0) return;
  const enemies = state.enemies;
  const kb = config.sword.knockback;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.hp <= 0) continue;
    if (s.hitIds.indexOf(e.id) !== -1) continue;
    if (!isInSwordArc(state, e)) continue;
    s.hitIds.push(e.id);
    const dmg = s.damage;
    e.hp -= dmg;
    e.hurtTimer = config.combat.enemyHurtFlashTime;
    e.stunTimer = config.combat.enemyHitStun || 0;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1e-6) {
      e.x += (dx / d) * kb;
      e.y += (dy / d) * kb;
    } else {
      e.x += Math.cos(s.swingAngle) * kb;
      e.y += Math.sin(s.swingAngle) * kb;
    }
    // Un enemigo que ya entró no puede ser empujado fuera de la arena (el paso puede cortarse por levelup).
    if (e.entered) {
      e.x = clamp(e.x, e.radius, config.arena.width - e.radius);
      e.y = clamp(e.y, e.radius, config.arena.height - e.radius);
    }
    state.events.push({ type: 'hit', enemyId: e.id, enemyType: e.type, damage: dmg, x: e.x, y: e.y, killed: e.hp <= 0 });
    addEffect(state, 'hit', e.x, e.y, config, e.type, e.variant);
  }
}

/** Daño por contacto de un enemigo al jugador. Respeta contactTimer e i-frames. */
export function tryContactDamage(state, enemy, config) {
  const p = state.player;
  if (enemy.contactTimer > 0 || p.invulnTimer > 0 || p.hp <= 0) return 0;
  const dmg = computeDamageTaken(enemy.damage, p.defense, config);
  p.hp -= dmg;
  p.invulnTimer = config.player.invulnTime;
  p.hurtTimer = config.player.hurtFlashTime;
  enemy.contactTimer = config.combat.enemyContactCooldown;
  state.events.push({ type: 'playerHit', damage: dmg, hp: Math.max(0, p.hp), sourceId: enemy.id, sourceType: enemy.type });
  addEffect(state, 'playerHit', p.x, p.y, config);
  if (p.hp <= 0) {
    p.hp = 0;
    state.mode = 'gameover';
    state.events.push({
      type: 'gameOver', score: state.score, level: p.level, kills: state.kills,
      time: state.time, wave: state.wave.number,
    });
  }
  return dmg;
}
