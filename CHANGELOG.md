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

### QA de sesión (jugando desde otro PC)
- "Se me quedó pegado cuando me llegó un disparo": NO era crash — era la
  muerte sin feedback (estado DEAD congela el tick y no existía pantalla de
  muerte hasta stage 6). Verificado: 0 excepciones al morir a fireball.
  Fix mínimo: `game.respawn()` (recarga el nivel) + pantalla "YOU DIED —
  ENTER" en DOM (`#msg`); el loop `frame()` ahora rodea tick/render con
  try/catch (un frame malo nunca mata el rAF).
- **Log local de errores en página** (`#errlog`): captura `window error`,
  `unhandledrejection` y excepciones del loop, con timestamp + stack (20
  últimas). Invisible si no hay nada; permite depurar desde la máquina del
  jugador sin devtools. Verificado con errores reales inyectados.
- Tests: 82 pasando (+1: respawn tras muerte).

### Etapa 4: armas, sangre, viewmodel y audio
Cuatro armas jugables (teclas 1-4 / rueda del ratón; disparo: ratón o espacio):
- **Puños** (melee arco 31°, 1.3u), **Pistola** (hitscan, 10-30 dmg, 50 balas),
  **Escopeta** (hitscan 8 perdigones, dispersión ±3.4°, 8 cartuchos),
  **Plasma** (proyectil + splash r1.6, 9 dmg AoE, 20 celdas).
  Agotadas -> auto-fallback (escopeta/plasma->pistola->puños) con mensaje.
- `src/game/weapons.js` (definiciones + lógica pura), `src/game/particles.js`
  (pool 128 de partículas de sangre: gravedad, proyección a pantalla,
  depth-test por píxel), `src/gfx/weaponSprites.js` (4 viewmodels
  procedurales 128x80, idle/fire), `src/audio/sfx.js` (11 sfx WebAudio
  100% sintetizados, sin assets; no-op sin AudioContext) y
  `src/audio/music.js` (bucle bass+arp generativo con reloj del
  AudioContext). Audio se desbloquea con el primer gesto (click/tecla).
- **Decals persistentes en paredes** (sangre/quemadura): pool 128 +
  cabezas por (celda, cara); el plasma al muro re-rayeasta la cara exacta
  (side + texX); coalescencia por spot y tope de 16 por cara (el renderer
  recorre la cadena por píxel — el bench lo exigía: 3.9 -> 1.2 ms/frame).
- **Bug de render de muros detectado en ruta**: las columnas muestreaban
  SIEMPRE la columna-0 de la textura más un desplazamiento vertical de
  `64*texX` (cizallado por celda): los muros eran bandas, no ladrillos.
  Fix en `renderer.render`: `u` = columna de textura por slice, `v` = fila
  desde el tope del slice (índice `((v<<6)+u)<<6|lvl`, como los suelos).
  Verificado por test (variedad de columnas en una cara + decal en la
  posición esperada) y a ojo en frame.

Tests: 97 pasando (+15: weapons). Bench: stage4 combate pistola
0.48 ms/frame; plasma 1.23 ms/frame (presupuesto 16.66).
Soak combate en navegador real: imp matado (kills=1, cadáver), sangre
dibujada a mitad de la pelea, el jugador muere al fireball de vuelta
(death screen), 0 errores de consola; bindings 1-4 por eventos reales;
sweep QA CLEAN.

### Etapa 4 — Pulidos (QA de sesión jugador)
- **Audio: sfx en silencio (bug real)**. La música usaba el reloj vivo del
  AudioContext (`currentTime`), pero el banco de sfx agendaba nodos en
  tiempo absoluto `t0 = 0.001`: pasado ~1s de música, esos nodos caían en
  el pasado y WebAudio los descartaba en silencio. Fix: cada entrada del
  banco recibe `t0 = actx.currentTime + 0.01` (`playSfx` lo inyecta).
  Confirmado por el jugador: ahora suena todo.
- **Cambio de arma parecía un disparo** (solo visual). `switchWeapon`
  armaba `swingT` (el temporizador del frame de fuego: muzzle-flash +
  retroceso). Ahora arma `switchT` (0.16s): el viewmodel baja ~10px y
  sube al sitio (animación de cambio neutra). Verificado por test con
  discriminador de flash cálido: el frame mid-switch NO lleva muzzle-flash
  y no consume munición ni dispara nada.
- **Reticle (AIM que se cumple)**: cross verde de 7px en el exacto centro
  de pantalla — donde aterriza el pellet/bolte central — dibujado por
  encima de todo (solo en PLAY; 9 px). Sin dashboard a esta altura: HUD
  completo es etapa 6.
- **Sweep QA: 404 de fondo de Chrome**. El navegador (favicon/updater)
  genera 404s sin ninguna petición de la página; el gate los contaba y
  fallaba de forma flaky. Now: se ignoran 404s cuya URL no es nuestro
  origen (127.0.0.1:8000); ahora se ignoran esos 404s; un módulo roto del
  juego sigue fallando el sweep por el chequeo `?debug handle missing`.
- Tests: 100 pasando (+3: reticle en el centro del buffer, cambio de arma
  neutro, AIM central cumplido por el plasma). Sweep CLEAN en 2/2
  ejecuciones; frame QA `_qa/l_reticle.png`.

### Backlog (visual, reportado por el jugador — sin bloquear)
- **Puños**: (a) el frame de golpe dibuja una banda de brazo ancha
  (`paintFist` t===1: filas 10-74 del sprite) y "se ilumina todo" — debería
  ser un swing compacto de un puño; (b) no se intercalan manos izquierda/
  derecha — agregar paridad por swing (`punchParity`) con frame espejado.

### Etapa 5: ítems, llaves, puertas (¡por fin!), secreto y E2M1
- **Bug estructural hallado al conectar la tecla E: `input.use` nunca se
  leía.** Las puertas se renderizaban (y los tests movían `doorH` a mano),
  pero en el juego real NO se podían abrir. Etapa 5 conecta el uso completo:
  - `src/game/interact.js`: `useAction` (E **o** U, estilo Doom) — raycast de
    ~1.3u adelante: puertas D/S abren; R/B necesitan keycard (mensaje
    "NEED THE ... KEYCARD" + sfx `denied`); la pared secreta S cuenta
    `stats.secrets` una vez ("SECRET FOUND"); el switch X a <=1.3u completa
    el nivel. Nada interactivo adelante → blip corto de `denied`.
  - Animación de puerta: `doorH` 0→1 en 0.55s (el renderer ya leía `doorH` —
    media altura real); `rebuildView` solo al cruzar 0.95.
  - **Progresión**: `levels=[E1M1, E2M1]`. Exit → `INTERM` (2.4s, ENTER
    salta) → carga el siguiente nivel llevando llaves (`loadLevel(idx,
    carryKeys)`); último nivel → `WON` ("YOU ESCAPED" + ENTER). Muerte sigue
    reiniciando sin llaves.
- **Ítems con pickups por pisar** (tope de radio 0.55u, auto — no hay tecla
  de recoger): `src/game/items.js` (pool 48) + `src/gfx/itemSprites.js`
  (7 sprites 32x32 procedurales: medpack, casco, balas, cartuchos, celdas,
  keycard rojo/azul flotante). Reglas Doom: hp+25 (top 100, completo no
  recoge), armadura +50 (top 100), munición a tope por arma (200/50/100),
  keycards persistentes (se llevan entre niveles; se pierden al morir).
  Mensaje + sfx `pickup` + sonido espacial para que despierten enemigos.
- **E2M1 ARMORY** (32x24, theme 1): sala inicial → sala de llaves
  (keycard azul entre 2 demonios) → gran salón (imp/cacer, munición) →
  puerta B → sala de salida (X) con nicho secreto S (armadura). 9 enemigos,
  14 ítems, 5 puertas (3 D, 1 B, 1 S). Validado con flood-fill de
  alcanzabilidad (mismo criterio que levels.test.js).
- sfx nuevos: `denied` (buzz grave), `complete` (acento de nivel).
- Game.js creció con items/interacción: 379 → 395 líneas (redline <400);
  el render de ítems vive en items.js (`renderItems`) y el timer de
  intermisión en interact.js (`updateIntermission`) para mantener los
  módulos por debajo del tope.

Tests: 116 pasando (+15 en tests/items.test.js: pickups/tope/llaves,
E2M1 válido+alcanzable, puertas D/R/B/S con y sin llave, secreto una sola
vez, exit→INTERM→carga nivel siguiente, WON, item sprites). Bench: stage5
E2M1 lleno (9 enemigos + ítems + puertas abriéndose + viewmodel escopeta)
**0.637 ms/frame**. QA navegador: sweep CLEAN; soak funcional vía CDP con
tiempo real — medkit (hp 60→85), keycard rojo abierto la puerta R, exit →
INTERM → E2M1 por el rAF real, keycard azul real abierta la puerta B
(denied antes), 14 ítems, 0 errores de consola. Frame QA
`_qa/m_e2m1.png` + contact sheet 8 tiles.

## Stage 6 — HUD en buffer, menú, automapa y notoriedad (final)
- **Menú de título** (estado `MENU` inicial): pantalla WEBDOOM + controles
  sobre la escena; ENTER (tecla REAL) arranca en main.js. `tick` es no-op
  en MENU; tests de congelación.
- **HUD en buffer** (`src/gfx/hud.js` + `src/gfx/font5x7.js`, fuente 5x7
  bitmap procedural): franja inferior 26 px — cara del marine 8x8 por
  escala (daño 0..4, ojos siguen la dirección del golpe), HP verde,
  nombre de arma + munición amarilla, armadura, slots de keycard
  (rojo/azul encienden al llevarlos). Renderiza directo al buffer:
  testeable sin navegador.
- **Pista contextual de uso** (lo que faltaba para no quedarse perdido):
  `interact.js` ahora expone `scanUse()` ("¿qué hay enfrente?") compartida
  por `useAction` y el HUD — nunca pueden desacordarse. Frente a un target:
  "PRESS E / U - DOOR", "PRESS E / U - EXIT", o "RED/BLUE KEYCARD NEEDED"
  (cian, 12 px sobre la franja; el mensaje transitorio ámbar lo sustituye).
- **Automapa con TAB** (`src/game/automap.js`): panel opaco centrado
  192x144 (6 px/celda, 32x24 → exacto): solo celdas exploradas (muro
  ladrillo / suelo), puertas amarillas, secreto marrón, salida verde,
  enemigos en vivo, jugador con tick de rumbo. `input.map` (TAB
  mantener) lo habilita; test pixel a pixel + gate por flag.
- **Notoriedad de puertas y salida** (feedback de jugada real):
  - `doorLight(): puertas cerradas +8 niveles de luz (d<6u) para
    destacar de la pared (test del clamp).
  - Switch de **salida con marcador verde con cruz** (sprite billboard
    `itemSprites.exit`, 0.8u) visible a distancia — antes era una celda de
    suelo invisible. Smoke test de render.
  - **Objetivo por nivel** al cargar (6 s): "E1M1 HANGAR - FIND THE RED
    KEYCARD, THEN THE EXIT" (E2M1 lo suyo); mensajes largos caen a escala
    1 automáticamente (no desbordan los 480 px).
- **QA de proceso completo** (`scripts/qa-playthrough.mjs`, el que pedía el
  usuario): bot en la página REAL con eventos de teclado verdaderos
  (W/E/ENTER), pathfinding con el AStar del juego sobre la grid
  passable-por-puertas; secuencia completa MENÚ → E1M1 (llave roja, 2
  puertas, salida, INTERM) → E2M1 (llave azul, puerta B, salida) → **WON**
  en ~90 s, 0 errores de página. Invulnerable a propósito (QA de
  navegación/interacción; combate cubierto por tests + sweep).

Tests: 131 pasando (+15: fuente/HUD cara/HP/llave/hints/menú/automapa +
marcador de salida + objetivo). Bench stage6 (E1M1 lleno + HUD + automapa
abierto + disparando): **0.685 ms/frame** (budget 16.66). QA navegador:
sweep CLEAN + playthrough PASS (WON). Frames `_qa/n..r` (menú, objetivo,
pista de puerta, automapa, salida).

### Backlog (nuevo)
- **Boss final**: el usuario esperaba un jefe; el caco de la sala de
  salida de E2M1 es lo más cercano. Candidato: E3M1 con un caco
  reforzado/jefe propio antes de la victoria.
