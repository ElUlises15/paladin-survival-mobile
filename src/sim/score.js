// Puntaje: kills (bonus por oleada y por tipo) + tiempo con actividad reciente.

export function killPoints(enemy, wave, config) {
  return enemy.score * (1 + config.score.killWaveBonus * (wave - 1));
}

/**
 * Multiplicador de puntos de tiempo: 1 dentro de activityWindow desde la última kill
 * (o desde el inicio de la partida), luego decae linealmente hasta idleMult en activityDecay s.
 */
export function timeActivityMult(state, config) {
  const sc = config.score;
  const ref = state.lastKillTime > 0 ? state.lastKillTime : 0;
  const since = state.time - ref;
  if (since <= sc.activityWindow) return 1;
  const decay = sc.activityDecay || 0;
  if (decay <= 0) return sc.idleMult;
  const k = Math.min(1, (since - sc.activityWindow) / decay);
  return 1 + (sc.idleMult - 1) * k;
}

function refresh(state) {
  state.score = Math.floor(state.scoreDetail.kills + state.scoreDetail.time);
}

export function scoreKill(state, enemy, config) {
  const pts = killPoints(enemy, state.wave.number, config);
  state.scoreDetail.kills += pts;
  refresh(state);
  return pts;
}

export function updateTimeScore(state, dt, config) {
  state.scoreDetail.time += config.score.timePointsPerSecond * timeActivityMult(state, config) * dt;
  refresh(state);
}
