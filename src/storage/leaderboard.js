// Leaderboard local (Top N) — sin DOM. El Storage se inyecta (localStorage en el navegador, mock en tests).
// Nunca lanza: JSON corrupto, storage null o bloqueado, setItem que lanza (QuotaExceeded/SecurityError)
// → sigue funcionando en memoria y deja el motivo en `lastError`.

import { CONFIG } from '../config.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^\d{2}:\d{2}:\d{2}$/;
// Caracteres de control (C0, DEL, C1), separadores de línea/párrafo y < >.
// Filtrado por código (sin caracteres especiales literales en el fuente):
// control C0 (0-31), DEL y C1 (127-159), separadores U+2028/U+2029 y < >.
function isStripped(code) {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029
    || code === 0x3c || code === 0x3e;
}
function stripChars(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) out += isStripped(s.charCodeAt(i)) ? ' ' : s[i];
  return out;
}

function lbConfig(config) {
  return (config && config.leaderboard) || CONFIG.leaderboard;
}

/** Normaliza un nombre de jugador: trim, colapsa espacios, quita control y <>, recorta, vacío → defaultName. */
export function sanitizeName(name, config = CONFIG) {
  const lb = lbConfig(config);
  let s = typeof name === 'string' ? name : (name == null ? '' : String(name));
  s = stripChars(s).replace(/\s+/g, ' ').trim();
  const chars = Array.from(s); // respeta pares sustitutos al recortar
  if (chars.length > lb.nameMaxLength) s = chars.slice(0, lb.nameMaxLength).join('').trim();
  return s.length > 0 ? s : lb.defaultName;
}

/** Devuelve un Storage usable o null (p.ej. localStorage bloqueado por SecurityError). */
export function safeStorage(getter = () => globalThis.localStorage) {
  try {
    const s = getter();
    if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function') return null;
    s.getItem('__paladin_probe__'); // puede lanzar si el acceso está bloqueado
    return s;
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Fecha 'YYYY-MM-DD' y hora 'HH:MM:SS' en hora LOCAL. */
export function formatLocalDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function formatLocalClock(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Comparador: score desc, time desc, timestamp asc. */
export function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.time !== a.time) return b.time - a.time;
  return a.timestamp - b.timestamp;
}

function isNonNegFinite(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Valida y normaliza una entrada cargada; devuelve null si es inválida. */
export function validateEntry(raw, config = CONFIG) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { name, score, level, kills, time, date, clock, timestamp } = raw;
  if (typeof name !== 'string') return null;
  if (!isNonNegFinite(score) || !isNonNegFinite(kills) || !isNonNegFinite(time)) return null;
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) return null;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof clock !== 'string' || !CLOCK_RE.test(clock)) return null;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  return {
    name: sanitizeName(name, config),
    score: Math.floor(score),
    level: Math.floor(level),
    kills: Math.floor(kills),
    time,
    date,
    clock,
    timestamp,
  };
}

function errMsg(prefix, err) {
  const name = err && err.name ? err.name : 'Error';
  const msg = err && err.message ? `: ${err.message}` : '';
  return `${prefix} (${name}${msg})`;
}

export function createLeaderboard({ storage = null, config = CONFIG, now = () => new Date() } = {}) {
  const lb = lbConfig(config);
  const max = lb.maxEntries;
  const key = lb.storageKey;
  let memory = [];
  let lastError = null;

  const copy = (list) => list.map((e) => ({ ...e }));

  function normalize(list) {
    return list.slice().sort(compareEntries).slice(0, max);
  }

  function readStorage() {
    if (!storage) return null; // sin storage: solo memoria
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (err) {
      lastError = errMsg('No se pudo leer el leaderboard', err);
      return null;
    }
    if (raw == null) return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      lastError = errMsg('Leaderboard corrupto, se reinicia', err);
      return [];
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.entries) ? parsed.entries : null);
    if (!arr) {
      lastError = 'Leaderboard con formato inválido, se reinicia';
      return [];
    }
    const valid = [];
    for (const item of arr) {
      const e = validateEntry(item, config);
      if (e) valid.push(e);
    }
    if (valid.length !== arr.length) lastError = `Se descartaron ${arr.length - valid.length} entradas inválidas`;
    return valid;
  }

  // true mientras haya registros en memoria que el storage no aceptó: load() no debe pisarlos.
  let unsynced = false;

  function writeStorage() {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(memory));
      unsynced = false;
      return true;
    } catch (err) {
      unsynced = true;
      lastError = errMsg('No se pudo guardar el leaderboard (se mantiene en memoria)', err);
      return false;
    }
  }

  function load() {
    if (unsynced) {
      // La memoria es la fuente de verdad: combinar con lo que haya en storage (sin duplicar) y reintentar.
      const fromStorage = readStorage() || [];
      const seen = new Set(memory.map((e) => `${e.timestamp}|${e.name}|${e.score}|${e.time}`));
      const extra = fromStorage.filter((e) => !seen.has(`${e.timestamp}|${e.name}|${e.score}|${e.time}`));
      memory = normalize([...memory, ...extra]);
      writeStorage();
      return copy(memory);
    }
    const fromStorage = readStorage();
    if (fromStorage) memory = normalize(fromStorage);
    return copy(memory);
  }

  function add({ name, score, level, kills, time } = {}) {
    load();
    const d = now();
    const date = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
    const num = (v, min) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min);
    const entry = {
      name: sanitizeName(name, config),
      score: Math.floor(num(score, 0)),
      level: Math.max(1, Math.floor(num(level, 1))),
      kills: Math.floor(num(kills, 0)),
      time: Math.round(num(time, 0) * 100) / 100,
      date: formatLocalDate(date),
      clock: formatLocalClock(date),
      timestamp: date.getTime(),
    };
    const merged = normalize([...memory, entry]);
    const idx = merged.indexOf(entry);
    memory = merged;
    if (idx >= 0) writeStorage();
    return { entries: copy(memory), rank: idx >= 0 ? idx + 1 : null };
  }

  // Mismo criterio que add(): score desc, luego time desc, luego timestamp asc (el nuevo es el más reciente).
  function qualifies(score, time = 0) {
    load();
    if (memory.length < max) return true;
    const d = now();
    const candidate = {
      score: Math.floor(Math.max(0, num0(score))),
      time: Math.round(Math.max(0, num0(time)) * 100) / 100,
      timestamp: d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : Date.now(),
    };
    return compareEntries(candidate, memory[memory.length - 1]) < 0;
  }

  function clear() {
    memory = [];
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (err) {
      lastError = errMsg('No se pudo borrar el leaderboard', err);
    }
  }

  return {
    load,
    add,
    qualifies,
    clear,
    get lastError() {
      return lastError;
    },
  };
}

function num0(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Último nombre usado (para precargar el input de Game Over). Nunca lanza. */
export function loadLastName(storage, config = CONFIG) {
  const lb = lbConfig(config);
  if (!storage) return lb.defaultName;
  try {
    const v = storage.getItem(lb.nameStorageKey);
    return v == null ? lb.defaultName : sanitizeName(v, config);
  } catch {
    return lb.defaultName;
  }
}

/** Guarda el último nombre usado. Devuelve el nombre saneado (o null si no se pudo persistir). */
export function saveLastName(storage, name, config = CONFIG) {
  const lb = lbConfig(config);
  const clean = sanitizeName(name, config);
  if (!storage) return null;
  try {
    storage.setItem(lb.nameStorageKey, clean);
    return clean;
  } catch {
    return null;
  }
}
