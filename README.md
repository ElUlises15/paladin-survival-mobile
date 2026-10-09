# Paladin Survival RPG — versión web para celular

Survival top-down de fantasía oscura: un paladín con espada resiste oleadas infinitas de demonios.
No hay victoria: el objetivo es entrar al **Top 10** local. Corre directo en el navegador, sin instalar nada.

**Jugar:** https://elulises15.github.io/paladin-survival-mobile/

Es la v0.1 del juego (con los ajustes de balance de Ulises: `progression.xpGrowth = 3`, `waves.growth = 1.5`)
adaptada para celular y tablet. En la compu se sigue jugando igual que siempre, con teclado y mouse.

## En el celu

1. Abrí el link en Chrome (Android) o Safari (iPhone).
2. Tocá **Jugar**.
3. Opcional: *Agregar a la pantalla de inicio* (Safari: botón Compartir → "Agregar a inicio";
   Chrome: menú ⋮ → "Agregar a la pantalla principal"). Así se abre a pantalla completa y carga sin conexión.

| Acción | Control táctil |
|---|---|
| Mover | Apoyá el pulgar en la **mitad izquierda** y deslizá: aparece un joystick donde tocaste |
| Atacar | Mantené el **botón de la espada** (abajo a la derecha): apunta solo al demonio más cercano |
| Atacar hacia un punto | Tocá o mantené en la **mitad derecha** de la pantalla |
| Pausa / sonido | Botones arriba a la derecha (en Android también hay pantalla completa) |
| Subir de nivel | Tocá el atributo que quieras mejorar |
| Récords | Al terminar, escribí tu nombre y tocá **Guardar** |

Se juega en vertical y en horizontal; en horizontal se ve toda la arena (en vertical la cámara sigue al paladín).
Si cambiás de app o bloqueás el celu, el juego se pausa solo.

## En la compu

| Acción | Control |
|---|---|
| Mover | W A S D |
| Apuntar / atacar | Mouse / click izquierdo (mantener = seguir golpeando) |
| Pausa | Esc o P |
| Elegir atributo | Click o teclas 1–5 |
| Silenciar | M |

## Correrlo localmente

Los ES modules no cargan desde `file://`; hace falta un servidor estático, por ejemplo:

```bash
python3 -m http.server 4173
# y abrir http://127.0.0.1:4173/
```

Parámetros útiles: `?mobile` / `?desktop` fuerzan el layout, `?nosw` no registra el service worker, `?diag` muestra diagnóstico.

## Notas técnicas

- Vanilla HTML/CSS/JS, sin dependencias ni backend. Récords en `localStorage` del navegador (cada dispositivo tiene los suyos).
- `src/touch.js`: joystick virtual y botón de ataque (Pointer Events), mapeados al mismo input que el teclado.
- `src/ui/mobile.js`: canvas a pantalla completa con `devicePixelRatio` (tope 2), cámara y safe-area.
- `sw.js` + `manifest.webmanifest`: PWA liviana. Para publicar cambios, subí `CACHE_VERSION` en `sw.js`
  (si no, quien ya lo abrió sigue viendo la versión cacheada).
- La simulación (`src/sim`) y el balance (`src/config.js`) son los de la v0.1 + ajustes; no se tocaron reglas.
