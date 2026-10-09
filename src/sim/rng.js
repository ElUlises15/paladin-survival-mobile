// RNG determinista (mulberry32). El estado vive en state.rngState (uint32 como número).
// La simulación NUNCA usa Math.random.

export function seedToRngState(seed) {
  // Hash simple (xmur3-like) para aceptar cualquier número o string.
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Devuelve un float en [0, 1) y avanza state.rngState. */
export function random(state) {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state, min, max) {
  return min + (max - min) * random(state);
}

/** Entero en [0, n). */
export function randomInt(state, n) {
  return Math.floor(random(state) * n);
}
