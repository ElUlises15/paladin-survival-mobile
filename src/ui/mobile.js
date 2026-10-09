// Modo celular/tablet: canvas a pantalla completa con devicePixelRatio (tope 2), cámara que sigue al
// paladín cuando la arena no entra entera (vertical), safe-area y HUD compacto (styles.css → html.is-mobile).
// En escritorio no hace nada: el escenario 1920×1080 de v0.1 queda intacto.

export const MAX_DPR = 2;
// La arena se ve entera si entra a una escala razonable; si no (celular vertical), se hace zoom
// para que el lado corto muestre ~760 px de arena (paladín y demonios legibles) y la cámara sigue al jugador.
export const MOBILE_SHORT_SIDE_ARENA = 760;
export const MOBILE_MAX_ZOOM = 0.6;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Pura. Calcula la vista (en px CSS) para un viewport cssW×cssH con márgenes `insets` (safe-area/HUD).
 * Devuelve { scale, offsetX, offsetY, visibleW, visibleH } donde pantalla = arena * scale + offset.
 */
export function computeMobileView(cssW, cssH, arenaW, arenaH, focusX = arenaW / 2, focusY = arenaH / 2, insets = {}) {
  const top = num(insets.top), bottom = num(insets.bottom), left = num(insets.left), right = num(insets.right);
  const w = Math.max(1, num(cssW, 1) - left - right);
  const h = Math.max(1, num(cssH, 1) - top - bottom);
  const fit = Math.min(w / arenaW, h / arenaH);
  const zoom = Math.min(Math.min(w, h) / MOBILE_SHORT_SIDE_ARENA, MOBILE_MAX_ZOOM);
  const scale = Math.max(fit, zoom);
  const visibleW = w / scale;
  const visibleH = h / scale;
  const cx = visibleW >= arenaW ? arenaW / 2 : clamp(num(focusX, arenaW / 2), visibleW / 2, arenaW - visibleW / 2);
  const cy = visibleH >= arenaH ? arenaH / 2 : clamp(num(focusY, arenaH / 2), visibleH / 2, arenaH - visibleH / 2);
  return {
    scale,
    offsetX: left + w / 2 - cx * scale,
    offsetY: top + h / 2 - cy * scale,
    visibleW,
    visibleH,
  };
}

/**
 * Pura: ¿usar el layout de celular? `?mobile` / `?desktop` fuerzan el modo.
 * Puntero principal grueso (celular/tablet) → sí. Una ventana chica de escritorio (puntero fino) conserva
 * el escenario original de v0.1; solo un equipo con pantalla táctil y viewport chico pasa al layout móvil.
 */
export function shouldUseMobileLayout({ coarse = false, touchPoints = 0, width = 1920, height = 1080, search = '' } = {}) {
  const params = new URLSearchParams(search || '');
  if (params.has('desktop')) return false;
  if (params.has('mobile')) return true;
  if (coarse) return true;
  return touchPoints > 0 && (width < 760 || height < 430);
}

/** Pura: punto de pantalla (relativo al canvas, px CSS) → coords de arena. */
export function screenToArena(x, y, view) {
  const s = view && view.scale > 0 ? view.scale : 1;
  return { x: (x - num(view && view.offsetX)) / s, y: (y - num(view && view.offsetY)) / s };
}

export function isIOS(nav) {
  if (!nav) return false;
  const ua = String(nav.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints | 0) > 1);
}

export function createMobileLayout({ win, doc, canvas, renderer, arenaW, arenaH, hudEl = null }) {
  const root = doc.documentElement;
  const mq = (q) => (typeof win.matchMedia === 'function' ? win.matchMedia(q) : null);
  const coarseMq = mq('(pointer: coarse)');
  let active = false;
  let cssW = 0, cssH = 0, dpr = 1;
  let portrait = false;
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let view = { scale: 1, offsetX: 0, offsetY: 0, visibleW: arenaW, visibleH: arenaH };
  let lastViewKey = '';

  // Sonda CSS para leer env(safe-area-inset-*) (solo navegador real).
  let probe = null;
  function readSafeArea() {
    if (typeof win.getComputedStyle !== 'function' || !doc.body || typeof doc.createElement !== 'function') return insets;
    if (!probe) {
      probe = doc.createElement('div');
      probe.id = 'safe-area-probe';
      probe.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(probe);
    }
    const cs = win.getComputedStyle(probe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  function measure() {
    const search = (win.location && win.location.search) || '';
    const wantMobile = shouldUseMobileLayout({
      coarse: !!(coarseMq && coarseMq.matches),
      touchPoints: (win.navigator && win.navigator.maxTouchPoints) | 0,
      width: num(win.innerWidth, 1920),
      height: num(win.innerHeight, 1080),
      search,
    });
    if (wantMobile !== active) {
      active = wantMobile;
      root.classList.toggle('is-mobile', active);
      if (!active) {
        // Volver exactamente al canvas de escritorio de v0.1.
        canvas.width = arenaW;
        canvas.height = arenaH;
        renderer.setView(1, 0, 0);
        lastViewKey = '';
      }
    }
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width || win.innerWidth || 1));
    cssH = Math.max(1, Math.round(rect.height || win.innerHeight || 1));
    dpr = Math.min(MAX_DPR, Math.max(1, num(win.devicePixelRatio, 1)));
    portrait = cssH > cssW;
    root.classList.toggle('is-portrait', portrait);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    const safe = readSafeArea();
    // El HUD compacto ocupa la franja superior: la arena se encuadra debajo. En vertical, además,
    // se reserva la franja inferior para los pulgares (joystick / espada) y la arena queda arriba.
    const hudBottom = hudEl ? (hudEl.getBoundingClientRect().bottom || 0) : 0;
    const bottomReserve = portrait && root.classList.contains('is-touch') ? Math.min(230, cssH * 0.27) : 0;
    insets = {
      top: Math.max(safe.top, hudBottom),
      right: safe.right,
      bottom: safe.bottom + bottomReserve,
      left: safe.left,
    };
    lastViewKey = '';
  }

  function update(player) {
    if (!active) return;
    const fx = player ? player.x : arenaW / 2;
    const fy = player ? player.y : arenaH / 2;
    view = computeMobileView(cssW, cssH, arenaW, arenaH, fx, fy, insets);
    const key = `${view.scale}|${view.offsetX}|${view.offsetY}|${dpr}`;
    if (key !== lastViewKey) {
      lastViewKey = key;
      renderer.setView(view.scale * dpr, view.offsetX * dpr, view.offsetY * dpr);
    }
  }

  // Teclado en pantalla: el viewport visual se achica; las pantallas (nombre del récord) se ajustan a él.
  function syncVisualViewport() {
    const vv = win.visualViewport;
    if (!vv || !root.style || typeof root.style.setProperty !== 'function') return;
    root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
  }

  let pending = 0;
  function schedule() {
    syncVisualViewport();
    measure();
    // orientationchange en iOS informa tamaños viejos: volver a medir un poco después.
    if (typeof win.setTimeout === 'function') {
      win.clearTimeout(pending);
      pending = win.setTimeout(measure, 250);
    }
  }
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('resize', schedule);
    win.addEventListener('orientationchange', schedule);
  }
  if (win.visualViewport && typeof win.visualViewport.addEventListener === 'function') {
    win.visualViewport.addEventListener('resize', schedule);
    win.visualViewport.addEventListener('scroll', syncVisualViewport);
  }
  syncVisualViewport();
  if (coarseMq && typeof coarseMq.addEventListener === 'function') coarseMq.addEventListener('change', schedule);
  measure();

  return {
    get active() { return active; },
    get portrait() { return portrait; },
    get view() { return view; },
    get dpr() { return dpr; },
    measure,
    update,
    toArena(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return screenToArena(clientX - rect.left, clientY - rect.top, view);
    },
  };
}
