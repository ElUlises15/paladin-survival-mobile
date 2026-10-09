// Controles táctiles (celular/tablet). No toca la simulación: solo produce el mismo objeto de input
// que el teclado/mouse (moveX/moveY/aimX/aimY/attack, ver docs/INTERFACES.md).
//
//   · Mitad izquierda de la pantalla: joystick virtual que aparece donde apoyás el pulgar.
//     Pasada la zona muerta, la dirección se manda con magnitud 1 (misma velocidad que WASD).
//   · Mitad derecha: tocar/mantener apunta a ese punto y ataca (equivalente a click/mantener del mouse).
//   · Botón de espada: mantener = atacar con auto-apuntado al demonio vivo más cercano.
//   · Sin ataque, el paladín mira hacia donde camina.
// Listeners registrados una sola vez; dispose() los quita.

export const JOYSTICK_RADIUS = 56;      // px CSS: recorrido máximo del knob
export const JOYSTICK_DEADZONE = 0.18;  // fracción del radio sin movimiento
const FACE_DISTANCE = 120;              // distancia del punto de mira sintético (coords de arena)

/** Pura: desplazamiento del pulgar (px) → dirección de movimiento. Fuera de la zona muerta, vector unitario. */
export function joystickVector(dx, dy, radius = JOYSTICK_RADIUS, deadzone = JOYSTICK_DEADZONE) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  const len = Math.hypot(x, y);
  if (!(radius > 0) || len <= radius * deadzone) return { x: 0, y: 0, magnitude: 0 };
  return { x: x / len, y: y / len, magnitude: Math.min(1, len / radius) };
}

/** Pura: posición visual del knob, recortada al radio. */
export function knobOffset(dx, dy, radius = JOYSTICK_RADIUS) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  const len = Math.hypot(x, y);
  if (len <= radius || len === 0) return { x, y };
  return { x: (x / len) * radius, y: (y / len) * radius };
}

/** Pura: demonio vivo más cercano al jugador (o null). Solo lee el estado. */
export function nearestEnemy(state) {
  if (!state || !state.player || !Array.isArray(state.enemies)) return null;
  const { x: px, y: py } = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e || !(e.hp > 0)) continue;
    const d = (e.x - px) * (e.x - px) + (e.y - py) * (e.y - py);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Pura: ¿el toque cae en la zona del joystick (mitad izquierda)? */
export function isJoystickZone(clientX, viewWidth) {
  return clientX < Math.max(1, viewWidth) * 0.5;
}

export function createTouchControls({
  win = globalThis.window,
  layer,                 // superficie táctil sobre el canvas
  joyBase, joyKnob,      // elementos visuales del joystick (opcionales)
  attackButton,          // botón de ataque con auto-apuntado (opcional)
  toArena,               // (clientX, clientY) → { x, y } en coords de arena
  getState = () => null, // GameState actual (solo lectura) para auto-apuntado
  onFirstTouch,          // se llama una vez cuando se detecta uso táctil
  radius = JOYSTICK_RADIUS,
} = {}) {
  const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, vec: { x: 0, y: 0, magnitude: 0 } };
  const aim = { id: null, x: 0, y: 0, latch: false };
  let attackId = null;
  let attackLatch = false;   // toque rápido del botón: al menos un golpe
  let touchSeen = false;
  const out = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, hasAim: false };
  const listeners = [];

  function on(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  }
  function markTouch(e) {
    if (e.pointerType === 'mouse') return;
    if (!touchSeen) {
      touchSeen = true;
      if (typeof onFirstTouch === 'function') onFirstTouch();
    }
  }
  function capture(el, id) {
    try { if (el && typeof el.setPointerCapture === 'function') el.setPointerCapture(id); } catch { /* sin captura */ }
  }
  function viewWidth() {
    return (win && win.innerWidth) || 1;
  }

  // ---------- joystick visual ----------
  function showJoystick(active) {
    if (joyBase) {
      joyBase.classList.toggle('is-active', active);
      if (active) {
        joyBase.style.left = `${joy.ox}px`;
        joyBase.style.top = `${joy.oy}px`;
      } else {
        joyBase.style.left = '';
        joyBase.style.top = '';
      }
    }
    if (joyKnob) {
      const k = active ? knobOffset(joy.dx, joy.dy, radius) : { x: 0, y: 0 };
      joyKnob.style.transform = `translate(${k.x}px, ${k.y}px)`;
    }
  }
  function releaseJoystick() {
    joy.id = null;
    joy.dx = joy.dy = 0;
    joy.vec = { x: 0, y: 0, magnitude: 0 };
    showJoystick(false);
  }

  // ---------- superficie táctil ----------
  function onLayerDown(e) {
    markTouch(e);
    if (e.cancelable !== false && typeof e.preventDefault === 'function') e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const isMouse = e.pointerType === 'mouse';
    if (!isMouse && joy.id === null && isJoystickZone(e.clientX, viewWidth())) {
      joy.id = e.pointerId;
      joy.ox = e.clientX;
      joy.oy = e.clientY;
      joy.dx = joy.dy = 0;
      joy.vec = { x: 0, y: 0, magnitude: 0 };
      capture(layer, e.pointerId);
      showJoystick(true);
      return;
    }
    // Un segundo dedo en la mitad del joystick se ignora (no dispara ni pisa el auto-apuntado).
    if (!isMouse && isJoystickZone(e.clientX, viewWidth())) return;
    if (aim.id === null) {
      aim.id = e.pointerId;
      aim.x = e.clientX;
      aim.y = e.clientY;
      aim.latch = true;   // un toque rápido (down+up entre dos frames) igual golpea una vez
      capture(layer, e.pointerId);
    }
  }
  function onLayerMove(e) {
    if (e.pointerId === joy.id) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      joy.dx = e.clientX - joy.ox;
      joy.dy = e.clientY - joy.oy;
      joy.vec = joystickVector(joy.dx, joy.dy, radius);
      showJoystick(true);
    } else if (e.pointerId === aim.id) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      aim.x = e.clientX;
      aim.y = e.clientY;
    }
  }
  function onLayerUp(e) {
    if (e.pointerId === joy.id) releaseJoystick();
    if (e.pointerId === aim.id) aim.id = null;
  }
  // Cancelación (gesto del sistema, rotación, pérdida de captura): soltar sin dejar un golpe pendiente.
  function onLayerCancel(e) {
    if (e.pointerId === joy.id) releaseJoystick();
    if (e.pointerId === aim.id) { aim.id = null; aim.latch = false; }
  }
  // iOS: sin preventDefault en touchstart/touchmove aparecen zoom por doble toque, lupa y scroll.
  function blockTouch(e) { if (e.cancelable) e.preventDefault(); }

  on(layer, 'pointerdown', onLayerDown, { passive: false });
  on(layer, 'pointermove', onLayerMove, { passive: false });
  on(layer, 'pointerup', onLayerUp);
  on(layer, 'pointercancel', onLayerCancel);
  on(layer, 'lostpointercapture', onLayerUp);
  on(layer, 'touchstart', blockTouch, { passive: false });
  on(layer, 'touchmove', blockTouch, { passive: false });
  on(layer, 'contextmenu', blockTouch);

  // ---------- botón de ataque ----------
  function onAttackDown(e) {
    markTouch(e);
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (attackId !== null) return;
    attackId = e.pointerId;
    aim.latch = false;
    capture(attackButton, e.pointerId);
    if (attackButton) attackButton.classList.add('is-pressed');
    attackLatch = true;
  }
  function onAttackUp(e) {
    if (e.pointerId !== attackId) return;
    attackId = null;
    if (attackButton) attackButton.classList.remove('is-pressed');
  }
  function onAttackCancel(e) {
    if (e.pointerId !== attackId) return;
    attackLatch = false;
    onAttackUp(e);
  }
  on(attackButton, 'pointerdown', onAttackDown, { passive: false });
  on(attackButton, 'pointerup', onAttackUp);
  on(attackButton, 'pointercancel', onAttackCancel);
  on(attackButton, 'lostpointercapture', onAttackUp);
  on(attackButton, 'touchstart', blockTouch, { passive: false });
  on(attackButton, 'contextmenu', blockTouch);

  function reset() {
    releaseJoystick();
    aim.id = null;
    aim.latch = false;
    attackId = null;
    attackLatch = false;
    if (attackButton) attackButton.classList.remove('is-pressed');
  }

  return {
    /** Devuelve siempre el mismo objeto. hasAim=false → conservar el apunte anterior (mouse). */
    read() {
      out.moveX = joy.vec.x;
      out.moveY = joy.vec.y;
      out.attack = false;
      out.hasAim = false;
      const state = getState();
      const p = state && state.player;
      if (aim.id !== null || aim.latch) {
        const a = toArena(aim.x, aim.y);
        out.aimX = a.x;
        out.aimY = a.y;
        out.hasAim = true;
        out.attack = true;
        aim.latch = false;
      } else if (attackId !== null || attackLatch) {
        out.attack = true;
        const target = nearestEnemy(state);
        if (target) {
          out.aimX = target.x; out.aimY = target.y; out.hasAim = true;
        } else if (p && joy.vec.magnitude > 0) {
          out.aimX = p.x + joy.vec.x * FACE_DISTANCE; out.aimY = p.y + joy.vec.y * FACE_DISTANCE; out.hasAim = true;
        } else if (p) {
          out.aimX = p.x + Math.cos(p.facing || 0) * FACE_DISTANCE;
          out.aimY = p.y + Math.sin(p.facing || 0) * FACE_DISTANCE;
          out.hasAim = true;
        }
        attackLatch = false;
      } else if (p && joy.vec.magnitude > 0) {
        out.aimX = p.x + joy.vec.x * FACE_DISTANCE;
        out.aimY = p.y + joy.vec.y * FACE_DISTANCE;
        out.hasAim = true;
      }
      return out;
    },
    reset,
    get touchSeen() { return touchSeen; },
    get joystickActive() { return joy.id !== null; },
    dispose() {
      while (listeners.length) listeners.pop()();
      reset();
    },
  };
}
