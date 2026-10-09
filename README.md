# Paladin Survival RPG — versión web para celular

Survival top-down de fantasía oscura: un paladín con espada resiste oleadas infinitas de demonios.
No hay victoria: el objetivo es entrar al **Top 10** local. Corre directo en el navegador, sin instalar nada.

**Jugar:** https://elulises15.github.io/paladin-survival-mobile/

Es la v0.1 del juego adaptada para celular y tablet, con los ajustes aprobados por Ulises:
subís de nivel seguido (el primero a los ~20-25 s), la horda crece **en diagonal** (cada oleada de 30 s trae
10 demonios más que la anterior, sin estallar de golpe) hasta un tope de 120 en pantalla, y en el nivel 10
se desbloquea la habilidad **Giro**. En la compu se sigue jugando igual que siempre, con teclado y mouse.

## Habilidad: Giro

Al llegar al **nivel 10** aparece el aviso *¡Nueva habilidad: Giro!*. El paladín da una vuelta completa
con la espada y golpea a **todos** los demonios alrededor (con empuje hacia afuera).

- **Radio:** 1,5 × el alcance actual de la espada (crece si la espada mejora).
- **Daño:** 1,5 × un golpe normal (misma fórmula: ataque × multiplicador del arma), así que escala con tu progreso.
- **Recarga:** 8 s. Cada toque/tecla dispara un solo giro; mantener no repite.
- **Mejora sola** en los niveles 15, 20, 25 y 30 (rangos 2 a 5): más daño (hasta 2,6×), +10 % de radio por
  rango y menos recarga (hasta 5 s). Cada mejora se anuncia en pantalla y el rango se ve en el botón/HUD.

## En el celu

1. Abrí el link en Chrome (Android) o Safari (iPhone).
2. Tocá **Jugar**.
3. Opcional: *Agregar a la pantalla de inicio* (Safari: botón Compartir → "Agregar a inicio";
   Chrome: menú ⋮ → "Agregar a la pantalla principal"). Así se abre a pantalla completa y carga sin conexión.

| Acción | Control táctil |
|---|---|
| Mover | Apoyá el pulgar en la **mitad izquierda** y deslizá: aparece un joystick donde tocaste |
| Atacar | Mantené el **botón de la espada** (abajo a la derecha): apunta solo al demonio más cercano |
| Atacar tocando la pantalla | Tocá o mantené en la **mitad derecha** de la pantalla |
| Giro (desde el nivel 10) | Tocá el **botón redondo** que aparece arriba de la espada (el barrido oscuro muestra la recarga) |
| Pausa / sonido | Botones arriba a la derecha (en Android también hay pantalla completa) |
| Subir de nivel | Tocá el atributo que quieras mejorar |
| Récords | Al terminar, escribí tu nombre y tocá **Guardar** |

El paladín **siempre mira al demonio vivo más cercano** (quieto, caminando o atacando), en el celu y en la compu,
y la espada golpea hacia ahí. Si no hay demonios vivos, mira hacia donde caminás (celu) o hacia el mouse (compu).

Se juega en vertical y en horizontal; en horizontal se ve toda la arena (en vertical la cámara sigue al paladín).
Si cambiás de app o bloqueás el celu, el juego se pausa solo.

## En la compu

| Acción | Control |
|---|---|
| Mover | W A S D |
| Atacar | Click izquierdo (mantener = seguir golpeando); apunta solo al demonio más cercano |
| Apuntar sin demonios | Mouse |
| Giro (desde el nivel 10) | Q o 1 |
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
- La simulación (`src/sim`) es la de la v0.1 más el Giro (`src/sim/spin.js`). El balance vive en `src/config.js`:
  XP `xpBase 32`, `xpGrowth 1.22`; oleadas lineales `baseCount 10` + `linearIncrement 10` por oleada (`growth 1`),
  cada 30 s, tope `maxSimultaneous 120` y cola de espera con tope `maxQueue 60`; Giro en `spin`.
