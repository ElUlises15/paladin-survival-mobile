// Entrada de teclado/mouse → objeto `input` del contrato (docs/INTERFACES.md).
// Los listeners se registran una sola vez por createInput y se quitan con dispose().
// `touch` (opcional, src/touch.js): fuente táctil que se combina con teclado/mouse en read().

const MOVE_KEYS = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};

export function createInput({ win = window, canvas, toArena, isTyping = () => false, onPauseKey, onMuteKey, touch = null } = {}) {
  const held = { up: false, down: false, left: false, right: false };
  const snapshot = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false };
  let mouseDown = false;
  let clickLatch = false;   // conserva un click rápido (down+up entre dos frames) hasta la próxima lectura
  let lastClient = null;

  function onKeyDown(e) {
    if (isTyping()) return;
    const dir = MOVE_KEYS[e.code];
    if (dir) { held[dir] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && onPauseKey) { onPauseKey(); e.preventDefault(); }
    else if (e.code === 'KeyM' && onMuteKey) onMuteKey();
  }
  function onKeyUp(e) {
    const dir = MOVE_KEYS[e.code];
    if (dir) held[dir] = false;
  }
  function onMouseMove(e) { lastClient = { x: e.clientX, y: e.clientY }; }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    lastClient = { x: e.clientX, y: e.clientY };
    mouseDown = true;
    clickLatch = true;
    e.preventDefault();
  }
  function onMouseUp(e) { if (e.button === 0) mouseDown = false; }
  function onBlur() { reset(); }
  function onContextMenu(e) { e.preventDefault(); }

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('mousemove', onMouseMove);
  win.addEventListener('mouseup', onMouseUp);
  win.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  function reset() {
    held.up = held.down = held.left = held.right = false;
    mouseDown = false;
    clickLatch = false;
    if (touch) touch.reset();
  }

  return {
    // Devuelve siempre el mismo objeto (sin asignaciones por frame).
    read() {
      snapshot.moveX = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      snapshot.moveY = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (lastClient) {
        const p = toArena(lastClient.x, lastClient.y);
        snapshot.aimX = p.x;
        snapshot.aimY = p.y;
      }
      snapshot.attack = mouseDown || clickLatch;
      clickLatch = false;
      if (touch) {
        const t = touch.read();
        // El teclado tiene prioridad; si no hay WASD, manda el joystick (dirección unitaria).
        if (snapshot.moveX === 0 && snapshot.moveY === 0) {
          snapshot.moveX = t.moveX;
          snapshot.moveY = t.moveY;
        }
        if (t.hasAim) {
          snapshot.aimX = t.aimX;
          snapshot.aimY = t.aimY;
        }
        if (t.attack) snapshot.attack = true;
      }
      return snapshot;
    },
    // Si no hubo movimiento de mouse todavía, apuntar a un punto dado (p.ej. a la derecha del jugador).
    setDefaultAim(x, y) {
      if (!lastClient) { snapshot.aimX = x; snapshot.aimY = y; }
    },
    reset,
    dispose() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('mousemove', onMouseMove);
      win.removeEventListener('mouseup', onMouseUp);
      win.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
