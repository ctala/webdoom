# CHANGELOG — WebDoom

Frame times are CPU-only measurements from `node tests/bench.js` (V8, 480x270,
600-frame average). The 60fps budget is 16.66 ms/frame; browser GPU cost on top
is one `putImageData(480x270)` + a handful of 2D calls.

## Versionado y procedencia

- **Semver** en `package.json`. **v1.0.0 = base**: todo el histórico
  Stage 1–8 fue construido con **Qwen3.8 27B** (NVFP4 vía vLLM).
- Las mejoras post-base las construye **Qwen 3.8 Flash Next** (NVFP4 vía
  vLLM): commits con prefijo `flash:`, secciones `[flash]` en este
  CHANGELOG. Las secciones `Stage N` sin tag son la base 27B.
- Regla: mecánica/arma/nivel nuevo → minor (`1.x.0`); balance/fix →
  patch (`1.x.y`); cambio de motor (pitch) → `2.0.0`.
- Hoja de ruta y estado: `TODO.md`. Métricas por run: `EXPERIMENTS.md`.

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

## Stage 7 — Brújula de objetivo, THE WARDEN (jefe E3M1) y salida legible
- **`src/game/objective.js`** (puro, compartido): `currentObjective(game)`
  resuelve en prioridad — keycard ausente → jefe vivo (niveles boss) →
  switch de salida — con etiqueta + color; `compassInfo` da rumbo relativo
  ([-PI,PI]) + distancia. HUD, automapa y QA leen la MISMA función: nadie
  puede apuntar a cosas distintas.
- **Brújula + banner persistente** (feedback del jugador: "no sabía cuál
  era la salida, se parecía a recargar vida"): triángulo en el borde
  superior se desliza hacia el objetivo (0 rad = delante) + distancia en
  unidades, color del tipo; banner permanente "FIND THE RED KEYCARD" /
  "DEFEAT THE WARDEN" / "REACH THE EXIT" (H-38) que el mensaje transitorio
  y la pista de uso reemplazan. En el automapa, rombo del objetivo SIEMPRE
  visible (aunque la celda no haya explorada).
- **THE WARDEN** (`ENEMY_DEF.boss`, código de mapa `J`): hp450, flota
  (viewH 1.4), ráfaga de 3 bolts (±8.8°) cd1.7; a <45% hp se ENFURECE
  (flag: mensaje + sfx `enrage`) → cadencia ×0.55 y bolts +50% (36 dmg).
  Muerte: sfx `bossdie` + sangre 26 + "THE WARDEN FALLS - THE EXIT IS
  OPEN". `itemSprites`/`sprites.js`: cuerpo carmesí 32x32 con corona de
  8 púas, ojos, núcleo fundido que parpadea al atacar, burst de brasas en
  muerte; cadáver propio.
- **E3M1 THE PIT** (32x24, theme 2, último nivel): nicho inicial → puerta
  D → foso abierto con 4 pilares, Warden al centro (J 15,11), 3 escoltas
  (2 demonios + imp), 11 ítems (2 plasma, medpacks, escopeta, armadura)
  y switch X al norte. **La salida está SELLADA hasta matar al Warden**
  (`interact.js`: "THE WARDEN GUARDS THE EXIT" + sfx denied); al caer,
  sale y → **WON**.
- **Bug grave encontrado en el QA del jefe: el pool de proyectiles (y el
  de partículas de sangre) NUNCA devolvía sus slots (`release()`).**
  Tras ~32 tiros totales (juego + enemigos) el free-list se agotaba y
  `acquire()` devolvía `null` en silencio: el plasma del jugador y los
  bolts de TODOS los enemigos dejaban de existir sin error. Fix:
  `release()` en los 4 puntos de muerte del proyectil + `updateParticles`;
  `Pool.freeCount` + test de regresión (150 disparos, el pool nunca se
  agota). El bot de QA también filtraba slots al "tanquear" (fix aplicado).
- **Salida legible de verdad**: el marcador ahora es un arco verde
  brillante con FLECHA y **placa con texto "EXIT"** (micro-fuente 5px en
  el sprite) — el cruz-verde antigua se parecía al medpack. (Feedback
  directo del jugador.)
- Playthrough QA ahora mata al jefe de verdad: bot se acerca por el sur,
  plasma (tecla real Space) apuntando cada 70 ms; el Warden cae en ~9.5 s;
  salida → WON completo: 0 errores.

Tests: 144 pasando (+13: mapa/jefe/enfurecimiento/objetivo/brújula/arcos
de salida/pool). Bench stage7 (foso: Warden + escoltas + plasma + HUD):
**1.350 ms/frame** (budget 16.66). QA: sweep CLEAN, playthrough PASS
(MENÚ→E1M1→E2M1→E3M1 jefe→WON). Frames `_qa/s..v`.

## Stage 8 (cierre) — Repo público, deploy y registro del experimento
- **GitHub público**: <https://github.com/ctala/webdoom> (repo inicializado
  "como corresponde": `.gitignore`, README, CHANGELOG, sin secretos —
  escaneo de tokens/keys en el árbol; frames QA excluidas vía gitignore).
- **Deploy en Cloudflare Pages**: <https://webdoom-blu.pages.dev/> —
  configuración de páginas estáticas: **build command vacío**, output `/`
  (el root del repo ES el sitio; verificado post-deploy: 200 en root,
  módulos JS con MIME `application/javascript`, `og.png` y `favicon.png`
  sirviendo).
- **SEO / compartir URL**: `og:title/description/image` + Twitter card
  (`/og.png` = screenshot de la pantalla de título) y favicon con la cara
  del marine (también mata el 404 de favicon que ruidaba el sweep).
- **`EXPERIMENTS.md`**: registro del experimento — cronología por commit
  (45.8 h cronológicas, ~21-22 h entre commits, 14 commits, 6,925 SLOC,
  144 tests), los 12 bugs con su método de detección (4 reportados por la
  persona jugando, 8 por la QA del agente) y **datos de inferencia medidos**
  desde vLLM `:8001/metrics` + serie 10 s del engine (ventana
  19/08 06:47 → 20/08 12:50): 714 requests, 81.08 M tokens de prompt
  enviados, 3.18 M prefilled reales (prefix-cache 93.6 % ≈ 25× de ahorro),
  728 K generados (≈ 17.8 tok/s con GPU ocupado; el modelo rinde 250+ @16
  concurrentes pero el agente va serial), TTFT 8.3 s, 11.4 h GPU busy
  (93.5 %), DSpark k=14 con 1.70 tokens aceptados/paso (542.6 K aceptados
  en 318.9 K pasos), 0 preemptions. Benchmark del modelo:
  <https://benchmarks.cristiantala.com/modelo/qwen-3.8-27b/>.

## v1.0.1 — [flash] Procedencia y estándar de versionado (doc)
- README: "Origen" (base = Qwen3.8 27B) + sección nueva "Mejoras
  post-base" (Qwen 3.8 Flash Next, NVFP4 vía vLLM).
- Sección de versionado arriba + `TODO.md` (hoja de ruta v1.1 → v2.0 con
  verificación por etapa) + run 2 en `EXPERIMENTS.md` (pendientes los
  tokens del run Flash Next, a completar desde LiteLLM/vLLM al cerrar).

## v1.1.0 — [flash] Etapa F1: balance + dificultad
Bug de diseño reportado jugando: **el Warden se moría de lejos con la
pistola** — los hitscan no tenían atenuación (10–30 dmg a distancia
infinita) y el boss (range 11, speed 1.4) se quedaba kiteando inofensivo.

- **Fallo de distancia en hitscan** (`weapons.js`): reutiliza
  `damageFalloff` del motor (suelo 30 % más allá del rango). Rangos
  efectivos nuevos: pistola 11u, escopeta 7u. Plasma es proyectil y no
  falla, pero vida 1.8→1.5 s (alcance 16.2→13.5u).
- **Pistola nerf**: 10–30 → 8–16 dmg. Escopeta y puños intactos.
- **THE WARDEN**: 450→**550 hp**, `range` 11→8 y **`press: 5.0`** — en
  ATTACK avanza hasta ~5u (×1.3 speed si está enfurecido): cuerpo a
  cuerpo con su spray de 3 bolts o nada. Ya no es un sacacorchones.
- **Dificultad** (`src/game/difficulty.js`): ITYTD (daño recibido ×0.5,
  cadencia enemiga ×1.4, munición ×0.7) · **Hurt Me Plenty** (default) ·
  Ultra Violence (×1.5, ×0.8) · Nightmare (×2, ×0.65). Se elige en el
  título con ←/→ y persiste en `localStorage` (`wd.diff`).
- Menú: línea cian "DIFFICULTY: ..." (`hud.js`).
- Tests: **151** (+7: falloff, dmgTaken, cdMul, ammoMul, wrap, Warden
  cierra distancia). Ajustados: kill-pistol 8→24 disparos (nerf), boss
  hp 550. Bench peor caso **1,498 ms/frame** (budget 16,66). Sweep
  CLEAN. Playthrough PASS: el bot mata al Warden mejorado en 10,5 s con
  plasma pegado a él (tanqueando: ese es el plan — de cerca duele).

## v1.2.0 — [flash] Etapa F1.5: dificultad con bichos, accesible al morir
Feedback del jugador sobre v1.1.0: la dificultad no se veía cómo cambiar,
no se podía tocar tras morir, y "dificultad" sin más bichos se queda en
un multiplicador aburrido.

- **Cantidad de mobs** (`mobMul` en `difficulty.js` + `setupEnemies`):
  ITYTD elimina 1 de cada 3 spawns (el Warden NUNCA se elimina), HMP =
  fiel al mapa, Ultra Violence duplica un 30 % junto al original (solo
  en suelo libre), Nightmare 60 %. Verificado: los spawns caen en celda
  no sólida.
- **Cambio en pantalla de muerte**: ←/→ y teclas **1-4** también en
  DEAD; ENTER reintenta ya con la nueva dificultad (`respawn` recorre
  `setupEnemies`). El YOU DIED muestra la dificultad actual.
- **Selector explícito en el menú**: nombre grande cian + fila
  `*1 ITYTD  2 HMP  3 UV  4 NIGHTMARE` (marca `*` = glifo nuevo en la
  fuente 5x7). En el menú, 1-4 eligen dificultad (las armas siguen en
  1-4 durante el juego).
- Fix de slot reuse: `s.enraged` se reseteaba nunca → el mensaje
  "IS ENRAGED" podía perderse en reintentos del E3M1.
- Tests: **152** (+1 mobMul). Bench peor 1,346 ms/frame. Sweep CLEAN,
  playthrough PASS (WON).

## v1.3.0 — [flash] Etapa F2: game feel
El juego respondía bien en datos pero se sentía muerto: pegar no se
sentía, recibir no se veía, y todo sonaba en el centro de la cabeza.

- **Screen shake** (`player.shake` + render compartido): al recibir,
  jitter de yaw (±0.013 rad) + rebote de horizonte (±4.5 px) con
  decaimiento 0.45 s. Es puramente visual: `vAng`/`vJy` los consumen
  renderer (paredes+suelo), `spriteRenderer` (billboards) y partículas;
  la lógica y la colisión siguen en `p.ang`. Temblor pasivo extra con
  HP<40.
- **Viñeta roja** (`renderer.applyVignette`): tabla radial precomputada
  (0 centro, 90 esquinas); al golpear sube `hurtVig` (decae 0.77 s) y
  con HP<35 queda un 30 % permanente. Post-pass entero al buffer.
- **Patada del viewmodel**: retroceso hacia abajo proporcional a
  `swingT` (antes el disparo solo movía el sprite 4 px fijos).
- **Audio posicional**: `playSfx(name, x, y, player)` — cadena
  gain→StereoPanner por evento. `panInfo`: pan = −sin(ángulo relativo)
  (derecha = +1) y atenuación 1/(1+dist·0.12). Enemigos (`eshoot`,
  `edead`, `enrage`) y puertas ya pasan su posición. En node/tests el
  AudioContext no existe → todo sigue siendo no-op.
- **Puños (fix del backlog de la etapa 4)**: frame de golpe compacto
  (puño al centro, sin la banda de brazo que "iluminaba todo") + frame
  espejado y paridad `punchParity` que alternan mano en cada swing.
- Tests: **158** (+6 feel: decay de shake, render con shake, viñeta,
  pan L/R/dist, espejo de puños, paridad). Peor bench 3,030 ms/frame
  (viñeta permanente en el escenario de combate; budget 16,66). Sweep
  CLEAN y playthrough PASS (WON) con el shake activo en el boss fight.

## v1.4.0 — [flash] Etapa F3: luces dinámicas + gibs
- **Luces puntuales** (≤8 por frame, `renderer.lights`): el fog global ya
  no manda solo. Por columna de pared se suma `pointLightAdd` (caída
  cuadrática) evaluada en el punto exacto de impacto del rayo: el fogonazo
  (flash×12, r 6.5) ilumina la habitación al disparar y cada bolt de plasma
  viajando (r 4, i 10) pinta de verde las paredes cercanas. Coste: 8
  hipotenusas por columna → bench casi plano (3,086 ms/frame).
- **Gibs**: muerte con un golpe ≥35 dmg (plasma/escopeta a bocajarro/
  futuro cohete) dispara 24 fragmentos extra con ángulo pseudo-random por
  semilla de posición, sobre el spray normal del FSM.
- Tests: **161** (+3: falloff puro, pool ≤8 cableado, umbral de gibs).
  Sweep CLEAN, playthrough PASS (WON).

## v1.5.0 — [flash] Etapa F4: lanzacohetes + ametralladora
- **AMETRALLADORA (5)**: hitscan 6–12 dmg, cadencia 0.10 s, comparte balas
  con la pistola; el cono se abre mientras mantienes el dedo (ramp
  `spreadRamp` ×3.5, se resetea al soltar) — el spray tiene su riesgo.
- **LANZACOHETES (6)**: proyectil lento (7.5u/s) con estela (glow más
  grande + luz dinámica r 4.5) y splash de **60** en 2.4u; la onda daña
  también al tirador a bocajarro (sin rocket-jump, con la self-damage sí).
  Explosión = sfx `boom` + decal quemado + sangre a los enemigos en radio.
- Munición nueva: cajas `r` (ITEM_DEF ammoR, icono cajón con cohetes);
  una en **E2M1** (la armería, coherente).
- Teclas **5/6** y la rueda recorre las 6 armas. HUD: nombre y munición
  genéricos desde `WEAPON_DEF` (ya no hay switch de armas a mano).
- Fallback de munición ahora es estilo Doom: avanza por la lista a la
  siguiente arma con balas; puños solo al final (el test viejo asumía la
  cadena antigua y se actualizó a la semántica nueva).
- **mobMul esparcido (feedback del jugador)**: los extras de UV/Nightmare
  ya NO son gemelos pegados al original — se reparten por suelo libre del
  mapa, a >5u del spawn del jugador y a ≥2.5u de otros bichos, rotando
  tipos. El mapa se siente más poblado, no la misma sala duplicada.
- Tests: **166** (+5 guns: burst/ramp, splash+self-damage, kill por splash,
  fallback Doom, defs 6 armas; test mobMul ahora exige dispersión real).
  Bench peor 3,1 ms/frame. Sweep CLEAN, playthrough PASS (WON).

## v1.6.0 — [flash] Etapa F5: Lost Soul, Baron y Pain Elemental
- **LOST SOUL** (`L`): cráneo ardiente, HP 45 pero **speed 4.2** (el más
  rápido del juego), melee 16/0.7s y levita (lift 0.3). Aparece de la nada
  si te descuidas: castiga ir mirando al mapa. En E2M1, corredor medio.
- **BARON** (`N`): tanque verde de 180 hp, ráfaga de **2 bolts** (spread),
  rango 9.5. Guarda la esquina SE del foso de E3M1 (no corta la ruta del
  bot; es el premio del que explora).
- **PAIN ELEMENTAL** (`Q`): 250 hp, melee 22 y **paritorio**: cada 5 s
  escupe un imp al hueco libre más cercano (sfx `spawn`), respetando
  `ENEMY_MAX-2` de reserva. En la sala tras la puerta B de E2M1.
- `spawnEnemy` exportado (setup, spawner y tests usan el mismo camino);
  los imps paridos suman a `stats.totalKills` y resetean `spawnT/enraged`
  en el reuso de slot.
- Sprites procedurales nuevos: llama que parpadea por frame (Lost Soul),
  cuernos + carga doble en las manos (Baron), trompas rosadas y boca de
  parto (Pain Elemental) + sus cadáveres.
- Tests: **171** (+5: sets de sprite, sprint+melee, doble bolt, parto con
  cap, ceiling del pool). Sweep CLEAN, playthrough PASS (el bot ni pisa la
  esquina del Baron y sobrevive al paritorio de E2M1).

## v1.7.0 — [flash] Etapa F6 (1/2): powerups y suelo tóxico
- **BERSERK PACK** (`!`): puños ×2 permanentes + 20 hp (cap 200). En la
  sala norte de E3M1 — el ariete para el tanque que no encuentra plasma.
- **MEGASPHERE** (`M`): cura hasta el nuevo techo de **200 hp** (las boticas
  siguen capped en 100, así que sobre-pasar de 100 exige buscar la esfera).
- **INVISIBILIDAD PARCIAL** (`I`, 30 s): los ranged triplican su dispersión
  y los hitscan fallan la mitad de las ráfagas. En la esquina NE de E2M1.
- **TRAJE ANTIRRADIACIÓN** (`U`, 60 s) + **suelo tóxico `~`**: parse nuevo
  (`map.hazard/hasHazard`), el piso tóxico se pinta con una tabla propia
  teñida de naranja (generada en `makeTables`) y quema 10 hp/s con el
  `hurtPlayer` de siempre (geiger sfx); el traje lo anula. Celdas de
  peligro reales se usan en E5M1 (siguiente entrega).
- **Fix de carácter**: el Lost Soul usaba `L`, que en `WALLS` es muro bajo
  — nunca llegaba a aparecer. Ahora es `l` (en E2M1 ya visible). Lección:
  los códigos de entidad y de muro comparten el espacio de glifos.
- Tests: **176** (+5 power/hazard). Bench plano (la rama tóxica del
  floorcaster solo corre en niveles con `~`). Sweep CLEAN, playthrough PASS.

## v1.8.0 — [flash] Etapa F6 (2/2): E4M1, E5M1 y THE OVERLORD
- **E4M1 CROSSROADS**: hub central con 3 salas D al norte (en ellas caen
  las dos keycards), ala oeste tras la puerta R y ala este tras la B (secreto
  con la **megasfera**); la salida sur exige **ambas llaves** — primera
  puerta lógica con AND de llaves (`level.keys`, mensaje "BOTH KEYCARDS
  NEEDED" y objetivo que persigue la que falte).
- **E5M1 THE SPILL**: piso tóxico de verdad (el traje del oeste es
  obligatorio para cruzar el vertido), muros de piedra/metral/alturas
  (`2`, `3`, nichos), Baron vigilando en el pasillo radiactivo y
  **THE OVERLORD** (`W`, 750 hp, spray de 5 bolts, `press 4.5`, enfurece a
  <45 % = fase 2) tras la puerta D norte.
- Motor de generalización: `bossAlive`/objetivo/mensaje de muerte sirven a
  ambos jefes; `currentObjective` recorre arrays de llaves; el gate de
  salida soporta `keys[]`. WON solo al final de E5M1.
- **Bot genérico**: `qa-playthrough.mjs` ya no hardcodea E1→E3 — recorre
  `game.levels` (llaves → jefe → salida → intermedio) hasta WON. Con 5
  niveles: PASS (OVERLORD cae en 22.9 s).
- El test que asumía "E3M1 es el último" ahora valida la progresión; +1
  test nuevo del gate de dos llaves. Suite: **177**.
