// Oleadas: cantidad, programación uniforme de spawns, cap simultáneo con cola y avance.
import { pickEnemyType, spawnEnemy } from './enemies.js';

/** round(baseCount * growth^(wave-1)) */
export function waveEnemyCount(wave, config) {
  const wc = config.waves;
  return Math.max(0, Math.round(wc.baseCount * Math.pow(wc.growth, wave - 1)));
}

export function createWaveState(number, config) {
  return {
    number,
    total: waveEnemyCount(number, config),
    scheduled: 0,
    timer: 0,
    clearedTimer: 0,
    announced: false,
  };
}

/** Cantidad que debería estar programada a `timer` s: spawn i ocurre en i * spawnDuration / total. */
export function scheduledTarget(total, timer, config) {
  if (total <= 0) return 0;
  const dur = config.waves.spawnDuration;
  if (dur <= 0) return total;
  return Math.min(total, Math.floor((timer * total) / dur) + 1);
}

function announce(state) {
  const w = state.wave;
  w.announced = true;
  state.events.push({ type: 'waveStart', wave: w.number, total: w.total });
}

export function startNextWave(state, config) {
  const old = state.wave;
  // Lo que la oleada anterior no llegó a programar pasa a la cola: nunca se pierde.
  const leftover = old.total - old.scheduled;
  if (leftover > 0) {
    state.spawnQueue += leftover;
    state.stats.totalScheduled += leftover;
  }
  state.wave = createWaveState(old.number + 1, config);
  announce(state);
}

export function drainSpawnQueue(state, config) {
  const cap = config.waves.maxSimultaneous;
  while (state.spawnQueue > 0 && state.enemies.length < cap) {
    spawnEnemy(state, pickEnemyType(state, state.wave.number, config), config);
    state.spawnQueue -= 1;
  }
}

export function updateWaves(state, dt, config) {
  const w = state.wave;
  if (!w.announced) announce(state);
  w.timer += dt;
  const target = scheduledTarget(w.total, w.timer, config);
  if (target > w.scheduled) {
    const add = target - w.scheduled;
    state.spawnQueue += add;
    state.stats.totalScheduled += add;
    w.scheduled = target;
  }
  drainSpawnQueue(state, config);

  const cleared = w.scheduled >= w.total && state.spawnQueue === 0 && state.enemies.length === 0;
  if (cleared) w.clearedTimer += dt;
  else w.clearedTimer = 0;
  if (w.timer >= config.waves.waveDuration || (cleared && w.clearedTimer >= config.waves.clearedDelay)) {
    startNextWave(state, config);
  }
}
