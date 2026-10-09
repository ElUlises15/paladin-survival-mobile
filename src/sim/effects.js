// Efectos visuales efímeros (state.effects). Cada uno tiene t (edad) y duration; se eliminan al expirar.

const DEFAULT_DURATIONS = { hit: 0.2, death: 0.45, playerHit: 0.3, levelUp: 0.9, swordUp: 1.2 };
const DEFAULT_MAX = 300;

export function addEffect(state, kind, x, y, config, type, variant) {
  const fx = config.effects || {};
  const durations = fx.durations || DEFAULT_DURATIONS;
  const max = fx.maxActive || DEFAULT_MAX;
  const list = state.effects;
  if (list.length >= max) list.splice(0, list.length - max + 1);
  const effect = { kind, x, y, t: 0, duration: durations[kind] || DEFAULT_DURATIONS[kind] || 0.3 };
  if (type !== undefined) effect.type = type;
  if (variant !== undefined) effect.variant = variant;
  list.push(effect);
  return effect;
}

export function updateEffects(state, dt) {
  const list = state.effects;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    e.t += dt;
    if (e.t < e.duration) list[w++] = e;
  }
  list.length = w;
}
