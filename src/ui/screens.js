// Overlays sobre la arena: menú, pausa, subida de nivel, Game Over, leaderboard.
// Todos los listeners se registran UNA vez en createScreens y se quitan en dispose().
// Datos del usuario siempre vía textContent (nunca innerHTML).

import { CONFIG, ATTRIBUTE_KEYS } from '../config.js';
import { formatTime, formatInt, formatStat, previewAttribute } from './format.js';

const SCREENS = ['menu', 'paused', 'levelup', 'gameover', 'leaderboard'];
const PRIMARY_FOCUS = {
  menu: 'btn-play',
  paused: 'btn-resume',
  levelup: null,
  gameover: 'go-name',
  leaderboard: 'btn-lb-back',
};

export function createScreens(root = document, config = CONFIG, handlers = {}) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView || globalThis;
  const $ = (id) => root.getElementById(id);
  const call = (name, ...args) => (typeof handlers[name] === 'function' ? handlers[name](...args) : undefined);

  const overlays = $('overlays');
  const sections = {};
  for (const name of SCREENS) sections[name] = $(`overlay-${name}`);

  const nameInput = $('go-name');
  const saveBtn = $('btn-save-score');
  const goForm = $('go-form');
  const goStatus = $('go-status');
  const lbBody = $('lb-body');
  const lbEmpty = $('lb-empty');
  if (nameInput) nameInput.maxLength = config.leaderboard.nameMaxLength;

  let current = null;
  let previous = null;
  let gameoverData = null;
  let saved = false;
  let typing = false;
  let levelupState = null;
  const listeners = [];

  function on(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  }
  function setStatus(text, kind) {
    if (!goStatus) return;
    goStatus.textContent = text;
    goStatus.classList.toggle('is-ok', kind === 'ok');
    goStatus.classList.toggle('is-warn', kind === 'warn');
  }
  function setTyping(v) {
    typing = v;
    if (doc.documentElement) {
      if (v) doc.documentElement.dataset.typing = 'true';
      else delete doc.documentElement.dataset.typing;
    }
  }

  // ---------- botones ----------
  on($('btn-play'), 'click', () => call('onStart'));
  on($('btn-menu-records'), 'click', () => call('onShowLeaderboard'));
  on($('btn-resume'), 'click', () => call('onResume'));
  on($('btn-pause-restart'), 'click', () => call('onRestart'));
  on($('btn-pause-menu'), 'click', () => call('onMenu'));
  on($('btn-go-restart'), 'click', () => call('onRestart'));
  on($('btn-go-menu'), 'click', () => call('onMenu'));
  on($('btn-go-records'), 'click', () => call('onShowLeaderboard'));
  on($('btn-lb-back'), 'click', () => {
    // Volver: a Game Over si venimos de ahí (conserva el estado "guardado"), si no al menú.
    if (typeof handlers.onLeaderboardBack === 'function') return handlers.onLeaderboardBack(previous);
    if (previous === 'gameover' && gameoverData) return show('gameover', gameoverData);
    return call('onMenu');
  });

  const attrButtons = {};
  for (const key of ATTRIBUTE_KEYS) {
    const btn = $(`lu-btn-${key}`);
    attrButtons[key] = btn;
    on(btn, 'click', () => chooseAttribute(key));
  }
  function chooseAttribute(key) {
    if (current !== 'levelup') return;
    if (levelupState && levelupState.player && levelupState.player.pendingPoints <= 0) return;
    call('onChooseAttribute', key);
  }

  function submitName() {
    if (current !== 'gameover' || saved || !gameoverData || !gameoverData.qualifies) return;
    saved = true; // antes de llamar al handler: evita doble guardado (doble click / Enter repetido)
    if (saveBtn) saveBtn.disabled = true;
    if (nameInput) {
      nameInput.disabled = true;
      nameInput.blur();
    }
    setTyping(false);
    const result = call('onSubmitScore', nameInput ? nameInput.value : '');
    if (result && typeof result === 'object' && 'rank' in result) {
      setStatus(result.rank ? `¡Guardado! Puesto #${result.rank}` : 'Guardado', 'ok');
    } else {
      setStatus('¡Puntaje guardado!', 'ok');
    }
  }
  on(goForm, 'submit', (e) => {
    e.preventDefault();
    submitName();
  });

  // ---------- input de nombre: aislado de los controles del juego ----------
  on(nameInput, 'focus', () => setTyping(true));
  on(nameInput, 'blur', () => setTyping(false));
  const stopKeys = (e) => {
    e.stopPropagation(); // no llega a listeners de juego en window/document (fase burbuja)
    if (e.type === 'keydown' && e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) submitName();
    }
  };
  on(nameInput, 'keydown', stopKeys);
  on(nameInput, 'keyup', stopKeys);
  on(nameInput, 'keypress', (e) => e.stopPropagation());

  // ---------- teclado global: 1–5 en levelup ----------
  on(win, 'keydown', (e) => {
    if (typing || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (current !== 'levelup') return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '') || /^([1-9])$/.exec(e.key || '');
    if (!m) return;
    const idx = Number(m[1]) - 1;
    if (idx < ATTRIBUTE_KEYS.length) {
      e.preventDefault();
      chooseAttribute(ATTRIBUTE_KEYS[idx]);
    }
  });

  // ---------- render de cada pantalla ----------
  function renderLevelup(data) {
    const state = data && data.state;
    levelupState = state || null;
    const p = state && state.player;
    if (!p) return;
    const lvl = $('lu-level');
    if (lvl) lvl.textContent = String(p.level);
    const pts = $('lu-points');
    if (pts) pts.textContent = String(p.pendingPoints);
    for (const key of ATTRIBUTE_KEYS) {
      const { current: cur, next } = previewAttribute(p, key, config);
      const curEl = $(`lu-cur-${key}`);
      const nextEl = $(`lu-next-${key}`);
      if (curEl) curEl.textContent = formatStat(key, cur);
      if (nextEl) nextEl.textContent = formatStat(key, next);
      const btn = attrButtons[key];
      if (btn) {
        btn.disabled = p.pendingPoints <= 0;
        const label = config.progression.attributeLabels[key] || key;
        btn.setAttribute('aria-label', `${label}: ${formatStat(key, cur)} a ${formatStat(key, next)}`);
      }
    }
  }

  function renderGameover(data) {
    const d = data || {};
    const fresh = d !== gameoverData;
    gameoverData = d;
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('go-score', formatInt(d.score));
    set('go-level', String(d.level ?? 1));
    set('go-time', formatTime(d.time));
    set('go-kills', formatInt(d.kills));
    set('go-wave', String(d.wave ?? 1));
    if (fresh) {
      saved = false;
      if (nameInput) {
        nameInput.value = d.defaultName != null ? String(d.defaultName) : config.leaderboard.defaultName;
        nameInput.disabled = !d.qualifies;
      }
      if (saveBtn) saveBtn.disabled = !d.qualifies;
      const touchUi = !!(doc.documentElement && doc.documentElement.classList
        && doc.documentElement.classList.contains('is-touch'));
      if (d.qualifies) setStatus(touchUi ? '¡Entraste al Top 10! Escribí tu nombre y tocá Guardar.'
        : '¡Entraste al Top 10! Escribí tu nombre y presioná Enter.', null);
      else setStatus(`Puntaje fuera del Top ${config.leaderboard.maxEntries}. ¡Intentalo otra vez!`, 'warn');
    }
  }

  function renderLeaderboard(data) {
    const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
    const highlight = data && data.highlightRank != null ? data.highlightRank : null;
    if (!lbBody) return;
    while (lbBody.firstChild) lbBody.removeChild(lbBody.firstChild);
    const rows = config.leaderboard.maxEntries;
    for (let i = 0; i < rows; i++) {
      const e = entries[i];
      const tr = doc.createElement('tr');
      const cells = e
        ? [String(i + 1), String(e.name), formatInt(e.score), String(e.level), formatInt(e.kills),
          formatTime(e.time), String(e.date), String(e.clock)]
        : [String(i + 1), '---', '---', '-', '-', '--:--', '----------', '--:--:--'];
      for (const text of cells) {
        const td = doc.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      if (!e) tr.classList.add('is-empty');
      if (e && highlight === i + 1) tr.classList.add('is-new');
      lbBody.appendChild(tr);
    }
    if (lbEmpty) lbEmpty.hidden = entries.length > 0;
  }

  function show(name, data) {
    if (name != null && !SCREENS.includes(name)) throw new Error(`createScreens.show: pantalla desconocida "${name}"`);
    if (name !== current) previous = current;
    current = name ?? null;
    if (name === 'levelup') renderLevelup(data);
    else levelupState = null;
    if (name === 'gameover') renderGameover(data);
    if (name === 'leaderboard') renderLeaderboard(data);

    for (const key of SCREENS) {
      if (sections[key]) sections[key].hidden = key !== current;
    }
    if (overlays) overlays.hidden = current === null;
    if (current !== 'gameover' && typing && nameInput) nameInput.blur();

    const focusId = current ? PRIMARY_FOCUS[current] : null;
    if (focusId) {
      let target = $(focusId);
      if (current === 'gameover' && (!target || target.disabled)) target = $('btn-go-restart');
      if (current === 'gameover' && saved) target = $('btn-go-records');
      if (target && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        if (target === nameInput && typeof nameInput.select === 'function') nameInput.select();
      }
    } else if (current === null && doc.activeElement && doc.activeElement !== doc.body
      && typeof doc.activeElement.blur === 'function') {
      doc.activeElement.blur(); // devolver el teclado al juego
    }
  }

  function dispose() {
    while (listeners.length) listeners.pop()();
    setTyping(false);
  }

  return {
    show,
    get current() { return current; },
    get previous() { return previous; },
    isTyping() { return typing; },
    dispose,
  };
}
