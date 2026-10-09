// Punto de entrada del navegador: une simulación, render, HUD, pantallas, input y leaderboard.
// Un único loop requestAnimationFrame con acumulador de paso fijo; listeners registrados una sola vez.

import { CONFIG } from './config.js';
import {
  createGame, updateGame, chooseAttribute, setPaused, getDiagnostics, recomputePlayerStats, recomputeSword, xpToNext,
} from './sim/game.js';
import { createRenderer } from './render/renderer.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { installStageScaling, clientToArena } from './ui/layout.js';
import { createLeaderboard, safeStorage, loadLastName, saveLastName } from './storage/leaderboard.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createTouchControls } from './touch.js';
import { createMobileLayout, isIOS } from './ui/mobile.js';

const doc = document;
const canvas = doc.getElementById('arena');
const stage = doc.getElementById('stage');
const { width: ARENA_W, height: ARENA_H } = CONFIG.arena;
const { fixedDt, maxFrameDt } = CONFIG.simulation;

const storage = safeStorage();
const leaderboard = createLeaderboard({ storage, config: CONFIG });
const renderer = createRenderer(canvas, CONFIG);
const hud = createHud(doc, CONFIG);
const audio = createAudio(window);
installStageScaling(window, stage);
const root = doc.documentElement;
const nav = typeof navigator !== 'undefined' ? navigator : null;
const params = new URLSearchParams((typeof location !== 'undefined' && location.search) || '');

// Layout de celular (no-op en escritorio).
const mobile = createMobileLayout({
  win: window, doc, canvas, renderer, arenaW: ARENA_W, arenaH: ARENA_H,
  hudEl: doc.getElementById('side-panel'),
});
const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
// En dispositivos táctiles se recortan partículas decorativas (no cambia ninguna regla del juego).
if (coarsePointer && typeof renderer.setLowFx === 'function') renderer.setLowFx(true);
function setTouchMode() { root.classList.add('is-touch'); mobile.measure(); }
if (coarsePointer) root.classList.add('is-touch');
// Equipos híbridos (puntero principal fino pero con pantalla táctil): el primer toque real activa los controles.
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && !root.classList.contains('is-touch')) setTouchMode();
}, { capture: true });
const toArenaPoint = (cx, cy) => (mobile.active ? mobile.toArena(cx, cy) : clientToArena(cx, cy, canvas, ARENA_W, ARENA_H));

const app = {
  screen: 'menu',          // 'menu' | 'game' | 'leaderboard'
  game: null,
  accumulator: 0,
  lastFrame: null,
  gameOverHandled: false,
  scoreSubmitted: false,
  lastRank: null,
  gamesStarted: 0,
  rafLoops: 0,
  fps: 0,
  frameMs: 0,
};

const screens = createScreens(doc, CONFIG, {
  onStart: startGame,
  onRestart: startGame,
  onResume: () => resume(),
  onMenu: goToMenu,
  onShowLeaderboard: showLeaderboard,
  onChooseAttribute: handleChooseAttribute,
  onSubmitScore: submitScore,
});

const touch = createTouchControls({
  win: window,
  layer: doc.getElementById('touch-layer'),
  joyBase: doc.getElementById('joy-base'),
  joyKnob: doc.getElementById('joy-knob'),
  attackButton: doc.getElementById('btn-touch-attack'),
  spinButton: doc.getElementById('btn-touch-spin'),
  toArena: toArenaPoint,
  getState: () => app.game,
  onFirstTouch: setTouchMode,
});

const input = createInput({
  win: window,
  canvas,
  toArena: toArenaPoint,
  touch,
  isTyping: () => (typeof screens.isTyping === 'function' ? screens.isTyping() : false),
  onPauseKey: togglePause,
  isPlaying: () => !!app.game && app.game.mode === 'playing' && screens.current === null,
  onMuteKey: toggleMute,
});

// El audio solo puede arrancar tras un gesto del usuario (iOS: touchend/click son los gestos válidos).
const unlockAudio = () => audio.unlock();
for (const type of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(type, unlockAudio);

// ---------- botones en pantalla (pausa, sonido, pantalla completa) ----------
const muteBtn = doc.getElementById('btn-touch-mute');
function toggleMute() {
  const muted = audio.toggleMute();
  if (muteBtn) {
    muteBtn.classList.toggle('is-muted', !!muted);
    muteBtn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
    muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  return muted;
}
const pauseBtn = doc.getElementById('btn-touch-pause');
// Tras el click se les saca el foco: así Espacio (atacar) nunca los vuelve a "clickear" durante la partida.
const blurAfter = (btn) => { if (btn && typeof btn.blur === 'function') btn.blur(); };
if (pauseBtn) pauseBtn.addEventListener('click', () => { blurAfter(pauseBtn); togglePause(); });
if (muteBtn) muteBtn.addEventListener('click', () => { toggleMute(); blurAfter(muteBtn); });
const fsBtn = doc.getElementById('btn-fullscreen');
const canFullscreen = !!(doc.fullscreenEnabled && root.requestFullscreen) && !isIOS(nav);
if (fsBtn) {
  fsBtn.hidden = !canFullscreen;
  if (canFullscreen) {
    fsBtn.addEventListener('click', () => {
      blurAfter(fsBtn);
      if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {});
      else root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    });
    doc.addEventListener('fullscreenchange', () => {
      fsBtn.classList.toggle('is-on', !!doc.fullscreenElement);
      fsBtn.setAttribute('aria-label', doc.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa');
      mobile.measure();
    });
  }
}

// ---------- gestos del navegador: sin scroll, zoom, pull-to-refresh ni menú de pulsación larga ----------
function canScrollInside(target) {
  for (let el = target; el && el !== doc.body && el.nodeType === 1; el = el.parentNode) {
    if (el.classList && el.classList.contains('overlay-card') && el.scrollHeight > el.clientHeight + 1) return true;
    if (el.classList && el.classList.contains('lb-scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}
doc.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) { if (e.cancelable) e.preventDefault(); return; }
  if (!canScrollInside(e.target) && e.cancelable) e.preventDefault();
}, { passive: false });
for (const type of ['gesturestart', 'gesturechange', 'dblclick']) doc.addEventListener(type, (e) => e.preventDefault(), { passive: false });
doc.addEventListener('contextmenu', (e) => {
  if (!(e.target && e.target.tagName === 'INPUT')) e.preventDefault();
});
// iOS desplaza la página al enfocar el nombre con el teclado en pantalla: devolverla al cerrar.
doc.addEventListener('focusout', () => {
  if (mobile.active && typeof window.scrollTo === 'function') setTimeout(() => window.scrollTo(0, 0), 50);
});
doc.addEventListener('visibilitychange', () => {
  if (doc.hidden && app.game && app.game.mode === 'playing') pause();
});
window.addEventListener('pagehide', () => { if (app.game && app.game.mode === 'playing') pause(); });
// Al girar el celu las coordenadas del dedo cambian: soltar joystick/apuntado y pedir un toque nuevo.
window.addEventListener('orientationchange', () => input.reset());
if (typeof window.matchMedia === 'function') {
  const orientMq = window.matchMedia('(orientation: portrait)');
  if (orientMq && typeof orientMq.addEventListener === 'function') orientMq.addEventListener('change', () => input.reset());
}
// Teclado en pantalla: llevar el campo de nombre a la vista dentro de la tarjeta.
const nameField = doc.getElementById('go-name');
if (nameField) {
  nameField.addEventListener('focus', () => {
    if (!mobile.active) return;
    setTimeout(() => { try { nameField.scrollIntoView({ block: 'center' }); } catch { /* no-op */ } }, 300);
  });
}

function startGame() {
  app.game = createGame(CONFIG, { seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 });
  app.screen = 'game';
  app.accumulator = 0;
  app.gameOverHandled = false;
  app.scoreSubmitted = false;
  app.lastRank = null;
  app.gamesStarted += 1;
  input.reset();
  input.setDefaultAim(app.game.player.x + 100, app.game.player.y);
  clearToasts();
  hud.reset();
  hud.update(app.game);
  screens.show(null);
  showRotateHint();
}

// Sugerencia suave (nunca bloquea): en celular vertical conviene girar.
const rotateHint = doc.getElementById('rotate-hint');
let rotateHintTimer = 0;
function showRotateHint() {
  if (!rotateHint || !mobile.active || !mobile.portrait || !root.classList.contains('is-touch')) return;
  rotateHint.hidden = false;
  clearTimeout(rotateHintTimer);
  rotateHintTimer = setTimeout(() => { rotateHint.hidden = true; }, 3500);
}

function goToMenu() {
  clearToasts();
  app.game = null;
  app.screen = 'menu';
  input.reset();
  hud.reset();
  screens.show('menu');
}

function showLeaderboard() {
  // Si se abre desde Game Over sin guardar, la partida terminada sigue en app.game para volver.
  screens.show('leaderboard', { entries: leaderboard.load(), highlightRank: app.lastRank });
}

function pause() {
  if (!app.game || app.game.mode !== 'playing') return;
  setPaused(app.game, true);
  input.reset();
  screens.show('paused');
}

function resume() {
  if (!app.game || app.game.mode !== 'paused') return;
  setPaused(app.game, false);
  app.accumulator = 0;
  input.reset();
  screens.show(null);
}

function togglePause() {
  if (!app.game) return;
  if (app.game.mode === 'playing') pause();
  else if (app.game.mode === 'paused') resume();
}

function handleChooseAttribute(key) {
  const game = app.game;
  if (!game || game.mode !== 'levelup') return;
  if (!chooseAttribute(game, key, CONFIG)) return;
  if (game.mode === 'levelup') {
    screens.show('levelup', { state: game });   // quedan puntos pendientes
  } else {
    app.accumulator = 0;
    input.reset();
    screens.show(null);
  }
  hud.update(game);
}

function submitScore(name) {
  const game = app.game;
  if (!game || game.mode !== 'gameover' || app.scoreSubmitted) return;
  app.scoreSubmitted = true;
  const result = leaderboard.add({
    name,
    score: game.score,
    level: game.player.level,
    kills: game.kills,
    time: game.time,
  });
  saveLastName(storage, name, CONFIG);
  app.lastRank = result.rank;
  screens.show('leaderboard', { entries: result.entries, highlightRank: result.rank });
  return { rank: result.rank };
}

function handleGameOver(game) {
  app.gameOverHandled = true;
  input.reset();
  screens.show('gameover', {
    score: game.score,
    level: game.player.level,
    kills: game.kills,
    time: game.time,
    wave: game.wave.number,
    qualifies: leaderboard.qualifies(game.score, game.time),
    defaultName: loadLastName(storage, CONFIG) || CONFIG.leaderboard.defaultName,
  });
}

// ---------- avisos breves (habilidad desbloqueada / mejorada) ----------
const toastEl = doc.getElementById('toast');
const pendingToasts = [];
let toastTimer = 0;
function spinToast(ev) {
  const touchUi = root.classList.contains('is-touch');
  const max = CONFIG.spin.rankLevels.length;
  if (ev.type === 'abilityUnlock') {
    return { title: '¡Nueva habilidad: Giro!', sub: touchUi ? 'Tocá el botón redondo arriba de la espada' : 'Apretá Q o 1' };
  }
  return { title: `Giro mejorado: rango ${ev.rank}/${max}`, sub: 'Más daño, más radio y menos recarga' };
}
function flushToast() {
  if (!toastEl || !pendingToasts.length || toastTimer) return;
  if (screens.current !== null) return; // esperar a que se cierre el levelup
  const t = pendingToasts.shift();
  toastEl.textContent = t.title;
  const small = doc.createElement('small');
  small.textContent = t.sub;
  toastEl.appendChild(small);
  toastEl.hidden = true;
  void toastEl.offsetWidth; // reinicia la animación
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; toastTimer = 0; flushToast(); }, 3600);
}
function clearToasts() {
  pendingToasts.length = 0;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = 0;
  if (toastEl) toastEl.hidden = true;
}

function processEvents(game) {
  for (const ev of game.events) {
    audio.play(ev.type);
    if (ev.type === 'abilityUnlock' || ev.type === 'abilityRankUp') pendingToasts.push(spinToast(ev));
  }
}

function step(game) {
  updateGame(game, fixedDt, input.read(), CONFIG);
  processEvents(game);
  if (game.mode === 'levelup') {
    input.reset();
    screens.show('levelup', { state: game });
  } else if (game.mode === 'gameover' && !app.gameOverHandled) {
    handleGameOver(game);
  }
}

// Clases en <html> para mostrar los controles táctiles solo en juego (sin tocar el DOM si no cambia).
let chromeKey = '';
function syncChrome() {
  const inGame = !!app.game && screens.current === null;
  const key = inGame ? 'game' : (screens.current || 'none');
  if (key === chromeKey) return;
  chromeKey = key;
  root.classList.toggle('in-game', inGame);
  if (!inGame) touch.reset();
  if (!inGame && rotateHint) rotateHint.hidden = true;
}

let fpsFrames = 0;
let fpsTime = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const real = app.lastFrame === null ? 0 : now - app.lastFrame;
  app.lastFrame = now;
  const dt = Math.min(Math.max(real, 0), maxFrameDt);
  const t0 = performance.now();

  const game = app.game;
  if (game && game.mode === 'playing') {
    app.accumulator += dt;
    while (app.accumulator >= fixedDt) {
      app.accumulator -= fixedDt;
      step(game);
      if (game.mode !== 'playing') { app.accumulator = 0; break; }
    }
  } else {
    app.accumulator = 0;
  }

  if (mobile.active) mobile.update(game ? game.player : null);
  syncChrome();
  flushToast();
  renderer.render(game, now);
  if (game) hud.update(game);

  fpsFrames += 1;
  fpsTime += real;
  if (fpsTime >= 0.5) {
    app.fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  app.frameMs = performance.now() - t0;
}

// Diagnóstico de solo lectura para QA (copia; no permite modificar la partida).
function diagnostics() {
  return {
    app: {
      screen: app.screen,
      overlay: screens.current ?? null,
      gamesStarted: app.gamesStarted,
      rafLoops: app.rafLoops,
      fps: app.fps,
      lastFrameWorkMs: Number(app.frameMs.toFixed(3)),
      audioMuted: audio.muted,
      leaderboardError: leaderboard.lastError ?? null,
      stageTransform: stage.style.transform || null,
      mobileLayout: mobile.active,
      touchMode: root.classList.contains('is-touch'),
      view: mobile.active ? { ...mobile.view, dpr: mobile.dpr, canvasW: canvas.width, canvasH: canvas.height } : null,
    },
    game: app.game ? getDiagnostics(app.game) : null,
    // Posiciones (copias) para bots de QA que manejan el juego con eventos reales de mouse/teclado.
    enemies: app.game
      ? app.game.enemies.map((e) => ({ id: e.id, type: e.type, variant: e.variant, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp }))
      : [],
  };
}
Object.defineProperty(window, 'paladinDiagnostics', { value: diagnostics, writable: false, configurable: false });

const diagEl = doc.getElementById('diagnostics');
if (diagEl && new URLSearchParams(location.search).has('diag')) {
  diagEl.hidden = false;
  setInterval(() => { diagEl.textContent = JSON.stringify(diagnostics(), null, 1); }, 500);
}

// Hook de QA SOLO con ?debug (no se activa por defecto): fuerza una subida de nivel o una muerte rápida
// usando la propia simulación (suma XP / deja la vida al mínimo); no se usa en el juego normal.
if (params.has('debug')) {
  Object.defineProperty(window, 'paladinDebug', {
    value: Object.freeze({
      levelUp() { const g = app.game; if (g && g.mode === 'playing') { g.player.xp = g.player.xpToNext; return true; } return false; },
      nearDeath() { const g = app.game; if (g && g.mode === 'playing') { g.player.hp = 0.01; return true; } return false; },
      // Solo para QA: salta directo a un nivel (desbloquea el Giro en 10) sin puntos manuales pendientes.
      setLevel(n = 10) {
        const g = app.game;
        if (!g || g.mode !== 'playing') return false;
        const p = g.player;
        p.level = Math.max(1, n | 0); p.xp = 0; p.xpToNext = xpToNext(p.level, CONFIG);
        recomputePlayerStats(p, CONFIG); recomputeSword(g, CONFIG);
        p.hp = p.maxHp;
        return true;
      },
      // Solo para QA/perf: encola n enemigos extra (respetan el tope de simultáneos) y cura al paladín.
      horde(n = 120) {
        const g = app.game;
        if (!g || g.mode !== 'playing') return false;
        const max = Number.isFinite(CONFIG.waves.maxQueue) ? CONFIG.waves.maxQueue : Infinity;
        g.spawnQueue = Math.max(g.spawnQueue, Math.min(Math.max(0, n | 0), max));
        return true;
      },
      heal() { const g = app.game; if (g && g.mode === 'playing') { g.player.hp = g.player.maxHp; return true; } return false; },
    }),
  });
}

// Service worker (PWA): cachea los archivos estáticos para carga rápida/offline. Solo http(s) y con ?nosw lo saltea.
if (nav && nav.serviceWorker && typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '')
  && !params.has('nosw')) {
  // Una versión nueva del SW queda en espera y se activa recién cuando esta página ya cargó todos sus
  // módulos (nunca se mezclan HTML/JS de versiones distintas); se usa a partir de la próxima apertura.
  const activateWhenReady = (worker) => {
    if (worker && nav.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });
  };
  window.addEventListener('load', () => {
    nav.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
      if (reg.waiting) activateWhenReady(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') activateWhenReady(w); });
      });
    }).catch(() => { /* el juego funciona igual sin SW */ });
  });
}

screens.show('menu');
app.rafLoops += 1;
requestAnimationFrame(frame);
