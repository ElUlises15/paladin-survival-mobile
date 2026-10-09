// Escalado proporcional del escenario lógico 1920×1080 (letterbox) y conversión de coords de mouse.

import { CONFIG } from '../config.js';

/** Escala = min(w/designW, h/designH); offsets para centrar. Pura (testeable). */
export function computeStageTransform(viewW, viewH, designW = CONFIG.layout.designWidth, designH = CONFIG.layout.designHeight) {
  const w = Math.max(1, viewW || 0);
  const h = Math.max(1, viewH || 0);
  const scale = Math.min(w / designW, h / designH);
  return {
    scale,
    offsetX: Math.round((w - designW * scale) / 2),
    offsetY: Math.round((h - designH * scale) / 2),
  };
}

/**
 * Escala #stage para que entre completo en la ventana, centrado.
 * Registra UN listener de resize; dispose() lo remueve.
 */
export function installStageScaling(win = window, stage) {
  const el = stage || win.document.getElementById('stage');
  if (!el) throw new Error('installStageScaling: no se encontró #stage');
  let last = '';
  const apply = () => {
    const t = computeStageTransform(win.innerWidth, win.innerHeight);
    const css = `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})`;
    if (css !== last) {
      el.style.transformOrigin = '0 0';
      el.style.transform = css;
      el.style.setProperty('--stage-scale', String(t.scale));
      last = css;
    }
  };
  apply();
  win.addEventListener('resize', apply);
  let disposed = false;
  return function dispose() {
    if (disposed) return;
    disposed = true;
    win.removeEventListener('resize', apply);
  };
}

/** Pura: convierte un punto de cliente a coords de arena dado el rect en pantalla del canvas. */
export function clientRectToArena(clientX, clientY, rect, arenaW, arenaH) {
  const rw = rect.width || 1;
  const rh = rect.height || 1;
  return {
    x: ((clientX - rect.left) * arenaW) / rw,
    y: ((clientY - rect.top) * arenaH) / rh,
  };
}

/**
 * Mouse (clientX/Y) → coords de arena. getBoundingClientRect ya incluye el transform scale del escenario.
 * No recorta: un apunte fuera de la arena sigue siendo una dirección válida.
 */
export function clientToArena(clientX, clientY, canvas, arenaW = CONFIG.arena.width, arenaH = CONFIG.arena.height) {
  return clientRectToArena(clientX, clientY, canvas.getBoundingClientRect(), arenaW, arenaH);
}
