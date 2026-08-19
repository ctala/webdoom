# CHANGELOG — WebDoom

Frame times are CPU-only measurements from `node tests/bench.js` (V8, 480x270,
600-frame average). The 60fps budget is 16.66 ms/frame; browser GPU cost on top
is one `putImageData(480x270)` + a handful of 2D calls.

## Stage 1 — Loop fijo + raycaster de paredes sólidas (DDA)
- Loop de rAF con timestep fijo 60Hz (accumulator pattern, spiral-of-death guard).
- Raycaster DDA sobre grid con proyección de plano de cámara (corrección de
  fisheye: la distancia perpendicular del DDA es la profundidad exacta por
  columna). Fog por distancia y side-dim 28% en caras E/O.
- Colisión círculo-vs-grid con sliding por ejes y substeps de 0.2 celdas
  (sin tunneling a cualquier velocidad).
- A* por grid (lista abierta plana, desempate por g, reutiliza buffers).
- FSM de enemigo pura + proyección de sprites + luz/fallo de daño puros.
- Parseo de niveles ASCII (`src/engine/map.js`), nivel completado E1M1
  (32x24) validado con flood-fill de conectividad (test `levels.test.js`).
- Player con WASD + pointer lock (fallback de teclas en main.js aún básico).

Tests: 57 pasando (`node --test`).
Frame time (bench CPU): idle-walk **0.138 ms/frame**; walking+spin **0.079 ms/frame**.
Sin errores de consola en el run de tests.

## Stage 2 — Texturas procedurales + floor/ceiling casting
- Texturas 64x64 100% procedurales (ruido hash determinista, cero binarios):
  brick / tech / stone / metal + 4 puertas (D, R, B, secret-brick) y 3 temas
  de piso/techo. En el navegador se pintan vía Canvas2D offscreen
  (putImageData) y se compilan a tablas de sombreado [texel][64 niveles]
  (32 de brillo + 32 side-dim 28%).
- Floor + ceiling casting horizontal por scanline (lodev), con la misma
  base de cámara que el DDA: sin distorsión y sin z-buffer necesario
  (las paredes se pintan después y cubren lo cercano).
- Sectores de altura variable (1u/2u/3u) con offset vertical de proyección;
  se corrigió una línea de escala en lineH (factor 1/2 extra) detectada con
  test cuantitativo del borde superior de pared a distancia conocida.
- Temas de nivel: cada level elige par {piso, techo}.

Tests: 64 pasando (antes 57; +7 de texturas/alturas/fog).
Frame time (bench CPU, escenario completo texturizado): walk **0.435 ms/frame**,
walk+spin **0.385 ms/frame** (budget 16.66). Sin errores de consola.

## Stage 3 — Sprites billboard + 4 tipos de enemigo (FSM, A*, sonido)
- SpriteRenderer: billboards 32x32 con proyección a la misma base de cámara
  que el DDA, orden far-to-near, z-test por columna contra el z-buffer de
  (`depth`) de paredes (occlusión exacta, sin z-buffer propio), LUT de
  atenuación 32 niveles por brillo. Max 160 sprites por frame, inserción
  ordenada reutilizando arrays (cero allocations en caliente).
- 4 enemigos procedurales (Canvas2D offscreen, mismos pintores en navegador
  y en node vía stub software): imp (ranged fuego), demon (melee 4 uolfs),
  commander (hitscan ráfaga de 3), caco (bolas voladoras, flota +0.35).
  Sets de frames: idle/walk/atk/pain/death/corpse, deterministas.
- IA en `src/game/enemy.js` (estado en slots preasignados):
  - FSM SLEEP→ALERT→CHASE→ATTACK→PAIN→DEATH→CORPSE impulsada por eventos
    (sees/hears/inRange/hurt/dead/painDone/targetLost) — la tabla de
    transición es pura y testable.
  - Vía directa si hay line-of-sight; si no, A* a la celda del jugador
    (re-computado cada 1.3s o al quedarse atascado >0.9s); sin ruta →
    targetLost → duerme de nuevo (no se atasca en salas selladas).
  - Sonido: eventos {x,y,vol} emiten un radio `vol`; escuchan si están
    dentro → despiertan aunque no vean al jugador. El buffer se limpia al
    FINAL del tick (fijación de bug: al comienzo del tick se borraban
    sonidos emitidos entre ticks).
  - Melee con arco de swing 0.35s (golpea en la ventana central), separado
    por pares (push 0.25 si dist<0.6) para no apilarse.
- Balísticos enemigos (projectiles, pool de 32): substeps de 2 para no
  atravesar paredes ni saltarse al jugador; inaccuracy ±1.1° (fijación de
  bug: ±0.1 rad desviaba el 100% de los tiros a media distancia); owner=0
  → golpe al jugador con `damageFalloff`.
- Integración en `game.js`: `hurtPlayer` con reparto de armadura (70%),
  flash de daño, cara de HUD por nivel de vida; sprites de enemigos y
  orbes de proyectiles ya se renderizan tras las paredes.

Tests: 73 pasando (antes 64; +9: despertar por visión/sonido, melee,
muerte→cadáver, A* sin meterse en paredes, volleys de imp/caco, pool sano,
separación).
Frame time (bench CPU, E1M1 completo: 6 enemies con IA + proyectiles +
sprites): **0.423 ms/frame** (budget 16.66). Sin errores de consola.

### QA de navegador (Chromium headless vía CDP, página real servida)
El path de sprites/sombras en navegador NO se cubría con los tests node
(usan StubCtx). QA real detectó y corrigió 3 bugs browser-only:
1. `CanvasProxy` sincronizaba desde un `createImageData` nuevo (cero bytes)
   en vez del contenido del canvas → `Uncaught TypeError` al arrancar ⇒
   **pantalla negra** (solo se veía el cursor). Fix: `getImageData` tras
   cada op + forwarding de fillStyle/strokeStyle/lineWidth al ctx real.
2. `buildGlowSprites` leía `data[i+3]` (canal R de otro texel) en vez de
   `data[i*4+3]` → orbes con alpha basura.
3. `paintImp` pasaba radio negativa a `ellipse()` en frames de ataque
   (`2 − 9·0.5 = −2.5`); el canvas real lanza `IndexSizeError` (el stub no).
   Fix en el pintor + clamp defensivo en `CanvasProxy`.
Además: `willReadFrequently` en el canvas offscreen (adiós warning de
lecturas repetidas) y handle `window.__wd` tras `?debug` para QA CDP.
Regresión: `tests/sprites.test.js` (+5): path CanvasProxy sobre ctx-fake
bit-a-bit idéntico al stub, geometría de orbes, determinismo, clamp de
radios negativos contra un ctx estricto que lanza como el real.

Tests: 78 pasando.
QA en navegador: 0 excepciones, 0 mensajes de consola, frame completo
(1337/1337 muestras ≠ negro), y combat loop end-to-end: teletransporte al
lado de un imp → imp+comandante en ATTACK → fireballs (`#ffdc8c`) →
jugador muere (`state: DEAD`, kills registrados). Pantalla negra resuelta.

### QA de juego real (reporte del jugador: crash al ver una puerta)
`TypeError: Cannot read properties of undefined (reading '324')` en
`renderer.js:74` tras caminar un rato (Brave y Chrome): `idx 324 = fila
10 col 4` = la puerta D del corredor. Root cause: el renderer lee
`map.doorH`, pero `parseLevel` nunca la expone (vivía en `game.doorH`) y
solo se toca al dibujar una celda de puerta. Los soaks anteriores no
enmarcaron nunca una puerta, por eso no saltaba.
- Fix: `map.doorH = this.doorH` en `loadLevel` (una línea, misma fuente de
  verdad — `rebuildView` ya abre/cierra vía ese buffer).
- Regresión (`tests/doors.test.js`, +3): vista con celdas de puerta nunca
  lanza + barrido 360°; puerta cerrada ≠ negra, media abierta cambia el
  frame (sube 50%) y abierta cambia de nuevo; E1M1 de corridas por el
  corredor (ver D/R) sin excepción.
- **`scripts/qa-browser.mjs`** (0 deps): sweep QA sistémico — muestrea
  celdas abiertas + vecinas de TODAS las puertas (8 direcciones c/u) +
  45s de caminar; falla con exit 1 ante CUALQUIER error de consola o
  excepción de página. Corrección de proceso: este era el vacío por el
  que el bug llegó al jugador; por etapa se ejecuta antes de commitear.

Tests: 81 pasando. QA-sweep: CLEAN (0 errores).
