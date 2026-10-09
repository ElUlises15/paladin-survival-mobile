export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Diferencia angular absoluta en [0, PI]. */
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d < 0) d += TAU;
  return d > Math.PI ? TAU - d : d;
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
