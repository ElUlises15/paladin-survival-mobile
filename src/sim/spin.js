// Habilidad "Giro": el paladín da una vuelta completa (360°) y golpea a todo enemigo dentro de un radio.
// Se desbloquea por nivel (config.spin.unlockLevel) y sube de rango sola en config.spin.rankLevels.
// Un disparo por pulsación: la capa de input entrega `input.spin = true` una sola vez por toque/tecla.
// No toca player.facing (el giro es solo visual en el render); el daño usa la misma fórmula que la espada.
import { clamp } from './math.js';
import { addEffect } from './effects.js';

const TAU = Math.PI * 2;

export function createSpin() {
  return {
    rank: 0, radius: 0, damage: 0, cooldown: 0, cooldownTimer: 0,
    timer: 0, duration: 0, startAngle: 0, swept: 0, id: 0, hitIds: [], uses: 0, hits: 0, kills: 0,
  };
}

/** Rango (0 = bloqueada, 1..5) que corresponde a un nivel del jugador. */
export function spinRankForLevel(level, config) {
  const c = config.spin;
  if (!c || !(level >= c.unlockLevel)) return 0;
  let rank = 0;
  for (let i = 0; i < c.rankLevels.length; i++) if (level >= c.rankLevels[i]) rank = i + 1;
  return Math.max(1, rank);
}

/** Valores del giro para un rango, a partir del alcance y daño ACTUALES de la espada. */
export function spinStats(rank, swordRange, swordDamage, config) {
  const c = config.spin;
  if (!c || !(rank >= 1)) return { radius: 0, damage: 0, cooldown: 0 };
  const i = Math.min(rank, c.damageMult.length) - 1;
  return {
    radius: swordRange * c.radiusMult * (1 + c.radiusPerRank * (rank - 1)),
    damage: swordDamage * c.damageMult[i],
    cooldown: c.cooldown[Math.min(i, c.cooldown.length - 1)],
  };
}

/** Recalcula rango/valores derivados. Emite abilityUnlock / abilityRankUp al cambiar de rango. */
export function syncSpin(state, config) {
  const sp = state.spin;
  if (!sp || !config.spin) return false;
  const rank = spinRankForLevel(state.player.level, config);
  const prev = sp.rank;
  sp.rank = rank;
  const st = spinStats(rank, state.sword.range, state.sword.damage, config);
  sp.radius = st.radius;
  sp.damage = st.damage;
  sp.cooldown = st.cooldown;
  sp.duration = config.spin.duration;
  if (rank > prev) {
    if (prev === 0) state.events.push({ type: 'abilityUnlock', ability: 'spin', rank });
    else state.events.push({ type: 'abilityRankUp', ability: 'spin', rank });
    // Una recarga más corta de rango nuevo aplica de inmediato.
    if (sp.cooldownTimer > sp.cooldown) sp.cooldownTimer = sp.cooldown;
    return true;
  }
  return false;
}

/** ¿El enemigo está dentro del círculo del giro? */
export function isInSpinRadius(state, enemy) {
  const sp = state.spin, p = state.player;
  const dx = enemy.x - p.x, dy = enemy.y - p.y;
  const reach = sp.radius + enemy.radius;
  return dx * dx + dy * dy <= reach * reach;
}

/** Ángulo barrido [0..2π] relativo al inicio del giro. */
function relAngle(a, start) {
  let r = (a - start) % TAU;
  if (r < 0) r += TAU;
  return r;
}

export function canSpin(state) {
  const sp = state.spin;
  return !!sp && sp.rank >= 1 && sp.cooldownTimer <= 0 && sp.timer <= 0 && state.player.hp > 0;
}

/** Timers, activación y golpes del giro (los enemigos con hp <= 0 los procesa game.js). */
export function updateSpin(state, input, dt, config) {
  const sp = state.spin, p = state.player;
  if (!sp || !config.spin) return;
  if (sp.cooldownTimer > 0) sp.cooldownTimer = Math.max(0, sp.cooldownTimer - dt);

  if (input && input.spin && canSpin(state)) {
    sp.timer = sp.duration;
    sp.cooldownTimer = sp.cooldown;
    sp.startAngle = p.facing;
    sp.swept = 0;
    sp.id += 1;
    sp.uses += 1;
    sp.hitIds.length = 0;
    state.events.push({ type: 'spin', spinId: sp.id, rank: sp.rank, x: p.x, y: p.y, radius: sp.radius, angle: sp.startAngle });
    const fx = addEffect(state, 'spin', p.x, p.y, config);
    fx.radius = sp.radius;
  }
  if (sp.timer <= 0) return;

  sp.timer = Math.max(0, sp.timer - dt);
  const prog = sp.duration > 0 ? 1 - sp.timer / sp.duration : 1;
  sp.swept = prog >= 1 ? TAU : TAU * prog;
  const enemies = state.enemies;
  const kb = config.spin.knockback;
  const W = config.arena.width, H = config.arena.height;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.hp <= 0) continue;
    if (sp.hitIds.indexOf(e.id) !== -1) continue;
    if (!isInSpinRadius(state, e)) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Golpea cuando la hoja pasa por su ángulo (al final de la vuelta, a todos los que sigan dentro).
    if (d > p.radius && relAngle(Math.atan2(dy, dx), sp.startAngle) > sp.swept) continue;
    sp.hitIds.push(e.id);
    const dmg = sp.damage;
    e.hp -= dmg;
    sp.hits += 1;
    if (e.hp <= 0) sp.kills += 1;
    e.hurtTimer = config.combat.enemyHurtFlashTime;
    e.stunTimer = config.combat.enemyHitStun || 0;
    if (d > 1e-6) { e.x += (dx / d) * kb; e.y += (dy / d) * kb; }
    else { e.x += Math.cos(sp.startAngle) * kb; e.y += Math.sin(sp.startAngle) * kb; }
    if (e.entered) {
      e.x = clamp(e.x, e.radius, W - e.radius);
      e.y = clamp(e.y, e.radius, H - e.radius);
    }
    state.events.push({ type: 'hit', enemyId: e.id, enemyType: e.type, damage: dmg, x: e.x, y: e.y, killed: e.hp <= 0, source: 'spin' });
    addEffect(state, 'hit', e.x, e.y, config, e.type, e.variant);
  }
}
