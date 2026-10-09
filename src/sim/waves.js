// Oleadas: cantidad, programación uniforme de spawns, cap simultáneo con cola y avance.
import { pickEnemyType, spawnEnemy } from './enemies.js';

/** round((baseCount + linearIncrement*(wave-1)) * growth^(wave-1)). Con growth = 1 es lineal. */
export function waveEnemyCount(wave, config) {
  const wc = config.waves;
  const n = Math.max(1, wave) - 1;
  const linear = wc.baseCount + (Number(wc.linearIncrement) || 0) * n;
  const growth = wc.growth === undefined ? 1 : wc.growth;
  return Math.max(0, Math.round(linear * Math.pow(growth, n)));
}

/** Suma a la cola respetando waves.maxQueue; lo que no entra se descarta y se cuenta en stats.dropped. */
export function enqueueSpawns(state, n, config) {
  if (!(n > 0)) return 0;
  const max = config.waves.maxQueue;
  let add = n;
  if (Number.isFinite(max) && max >= 0) add = Math.max(0, Math.min(n, max - state.spawnQueue));
  state.spawnQueue += add;
  state.stats.totalScheduled += add;
  if (add < n) state.stats.dropped = (state.stats.dropped || 0) + (n - add);
  return add;
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
  // Lo que la oleada anterior no llegó a programar pasa a la cola (hasta waves.maxQueue).
  const leftover = old.total - old.scheduled;
  if (leftover > 0) enqueueSpawns(state, leftover, config);
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
    enqueueSpawns(state, target - w.scheduled, config);
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
