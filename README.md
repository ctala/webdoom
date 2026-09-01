# WebDoom

**Jugar → https://webdoom-blu.pages.dev/** (Cloudflare Pages)

FPS estilo Doom completo en el navegador. Cero dependencias, cero assets
binarios: texturas, sprites, sonido y música 100% procedurales
(Canvas2D offscreen + WebAudio). Motor propio sobre un buffer de píxeles
empacados 0xAABBGGRR (480x270, escalado 2x, 60 Hz en paso fijo).

## Origen

Este proyecto es un **experimento con Spark usando Qwen3.8 27B (NVFP4 vía
vLLM, [benchmark del modelo](https://benchmarks.cristiantala.com/modelo/qwen-3.8-27b/))**:
todo el motor, los niveles, el HUD, el audio y hasta la suite de QA fue
construido por el modelo en 7 etapas, de forma autónoma; la persona solo
jugó, reportó bugs de jugada ("no encuentro la salida", "el jefe no cae")
y dio la dirección. Sin assets, sin librerías, sin build step: es puro
HTML + módulos ES.

Números de cabecera (detalle y fuentes en `EXPERIMENTS.md`):

- **45.8 h** cronológicas de experimento (≈ 21-22 h entre commits, el resto
  jugando/reportando), 18/08 17:24 → 20/08 11:11 · **14 commits** ·
  **6,925 SLOC** · **144 tests** · 0 dependencias · 0 assets binarios.
- Inferencia (ventana 19/08 06:47 → 20/08 12:50, contadores vLLM):
  **714 requests** · **81.08 M tokens de prompt** enviados
  (solo **3.18 M** prefilled de verdad — **prefix-cache 93.6 %**, ≈25×
  menos cómputo) · **728 K tokens generados** (≈ **17.8 tok/s** con el GPU
  ocupado; streams sostenidos 11-13, el modelo rinde 250+ @16 concurrentes
  pero el agente va serial) · **TTFT 8.3 s** promedio · **11.4 h de GPU
  ocupado** (93.5 % de la ventana).
- **12 bugs** hallados por la QA del agente (4 reportados por la persona
  jugando); el grave: el pool de proyectiles nunca reciclaba y tras ~32
  tiros las balas dejaban de existir en silencio.

## Mejoras post-base

Desde v1.0.1 la continuidad del experimento la construye otro modelo:
**Qwen 3.8 Flash Next** (NVFP4 vía vLLM). La base (v1.0.0, etapas 1–8)
queda intacta y trazable: lo nuevo lleva prefijo `flash:` en git, tag
`[flash]` en `CHANGELOG.md` y roadmap en `TODO.md`.

- **v1.1.0** — Balance y dificultad: falloff de distancia en hitscan (ya
  no se mata al jefe de lejos con la pistola), THE WARDEN persigue (450→
  550 hp) y **4 dificultades** seleccionables en el título con ←/→.
- **v1.2.0** — La dificultad también cambia la **cantidad de bichos**
  (ITYTD ralea spawns; Nightmare esparce extras por el mapa) y se puede
  cambiar tras morir (teclas 1-4 o ←/→ en YOU DIED). Selector visible.
- **v1.3.0** — Game feel: screen shake, viñeta roja, patada del
  viewmodel, audio posicional (StereoPanner) y fix de los puños.
- **v1.4.0** — Luces dinámicas (fogonazo y proyectiles iluminan paredes)
  y gibs con golpes fuertes.
- **v1.5.0** — **Lanzacohetes** (splash, autodaño a bocajarro) y
  **ametralladora** (spread creciente); teclas 5/6, cajas de cohetes en
  E2M1. La dificultad dura esparce bichos extra por el mapa (no gemelos
  pegados).
- **v1.6.0** — Lost Soul, Baron y Pain Elemental (genera imps).
- **v1.7.0** — Powerups: berserk, megasfera (tope 200 hp), invisibilidad
  parcial, traje anti-radiación y **suelo tóxico**.
- **v1.8.0** — 5 niveles: **E4M1 CROSSROADS** (hub de dos llaves) y
  **E5M1 THE SPILL** (radiactivo, jefe final THE OVERLORD en dos fases).
- **v1.9.0** — Meta: **guardar/continuar** (C en el menú), pantalla de
  **stats por nivel** (kills %/secrets %/tiempo) y opciones FOV/gamma/
  sensibilidad (`-`/`=`, `[`/`]`, `,`/`.`). Los bichos extra de dificultad
  dura se reparten por todo el mapa (greedy farthest-point).

## Ejecutar

```sh
python3 -m http.server 8000
# -> http://localhost:8000/
```

Es un módulo ES: necesita servirse por HTTP (`file://` no funciona).
`?debug` expone `window.__wd` (el objeto Game) para inspección/QA.

## Deploy

Sitio 100% estático: **Cloudflare Pages** (o cualquier host estático).
Sin build command, sin output directory aparte — el root del repo es el
sitio (`index.html` + `src/` + `levels/`). Funciona tal cual; `?debug` no
interfiere (solo expone un handle extra).

- **Vivo**: <https://webdoom-blu.pages.dev/>
- **Código**: <https://github.com/ctala/webdoom> (público)

## Controles

| Tecla            | Acción                                    |
|------------------|-------------------------------------------|
| W/A/S/D (o flech.)| mover / strafear                          |
| Ratón            | apuntar (pointer lock)                    |
| Click izq. / Espacio | disparar                               |
| 1 / 2 / 3 / 4 / 5 / 6 (o rueda) | puños / pistola / escopeta / plasma / ametralladora / cohete |
| C (en el menú) | continuar partida guardada |
| `-` / `=` | FOV |
| `[` / `]` | gamma |
| `,` / `.` | sensibilidad del ratón |
| E o U            | usar: abrir puertas, secretos, salida     |
| TAB (mantener)   | automapa                                  |
| SHIFT            | correr                                    |
| ENTER            | empezar / reintentar tras morir / saltar intermedio |
| ← / → o 1-4 (menú/muerte) | dificultad: ITYTD · Hurt Me Plenty · Ultra Violence · Nightmare |
| ESC              | pausa (overlay PAUSED)                    |

## Niveles

1. **E1M1 HANGAR** — llave roja → puerta R → salida.
2. **E2M1 ARMORY** — llave azul + paritorio Pain Elemental → salida.
3. **E3M1 THE PIT** — arena de **jefe: THE WARDEN** (y Baron de esquina).
4. **E4M1 CROSSROADS** — hub con **las dos llaves**: sin ambas, la salida
   sur no se abre. Secreto con megasfera en el ala este.
5. **E5M1 THE SPILL** — vertido radiactivo: sin traje no cruzas; al norte,
   **THE OVERLORD** (750 hp, dos fases). Mata y huye: aquí está el **WON**.

Notoriedad: el juego siempre dice qué hay que hacer **y hacia dónde** —
triángulo-compás en el borde superior (rumbo + distancia al objetivo) y
banner permanente abajo ("FIND THE RED KEYCARD" / "DEFEAT THE WARDEN" /
"REACH THE EXIT"); el automapa (TAB) marca el objetivo con un rombo aunque
no hayas explorado esa zona. El switch de salida es un **arco verde con
placa "EXIT"** visible a distancia (ya no parece un medpack). Puertas con
llave piden el keycard ("RED/BLUE KEYCARD NEEDED").

## Testing y QA

```sh
node --test                      # suite completa (182 tests)
node tests/bench.js              # frame-time por escenario (budget 16.66 ms)
node scripts/qa-browser.mjs      # sweep navegador: 48 posiciones x 8 direcciones
CHROME_BIN=/ruta/a/chromium-headless node scripts/qa-playthrough.mjs
```

El playthrough (`scripts/qa-playthrough.mjs`) dispara Chromium headless vía
CDP y juega con eventos de teclado reales (W/E/Space/ENTER), usando el A*
del propio juego sobre el grid del nivel: MENÚ → E1M1 (llave roja,
puertas, salida) → E2M1 (llave azul, puerta B, salida) → **E3M1: mata al
Warden con plasma de verdad** → salida → WON. Requiere `CHROME_BIN`
apuntando a un Chromium headless.

## Arquitectura

```
index.html            canvas + overlays de estados
src/main.js           input → game, loop rAF, teclas 1-4/rueda (armas), Enter
src/engine/           raycaster DDA, renderer (walls/floor/ceil/decals), mapa
                      ASCII (códigos de entidades: enemigos, ítems, "J" jefe,
                      "X" salida), colisión, A*, sprites billboards, luz,
                      pool con free-list (reciclado), FSM de enemigos
src/gfx/              texturas procedurales + tablas de sombreado, sprites
                      (armas/ítems/enemigos/jefe), HUD en buffer + fuente 5x7,
                      sprites de salida (arco + placa EXIT)
src/audio/            sfx sintéticos + música generativa (WebAudio)
src/game/             game.js (orquestador, <400 líneas), player, enemigos
                      (incl. THE WARDEN: ráfaga 3 bolts, enfurece a <45% hp,
                      press: cierra a 5u), armas (fallo de distancia hitscan),
                      difficulty.js (ITYTD→Nightmare, menú ←/→), projectiles,
                      partículas, ítems, interacción
                      (puertas/salida/gate de jefe), objective.js (objetivo
                      compartido por HUD+automapa+QA), automapa
levels/               e1m1.js, e2m1.js, e3m1.js (ASCII 32x24)
tests/                node --test (motor, juego, niveles, jefe, HUD) + bench
scripts/              qa-browser.mjs (sweep), qa-playthrough.mjs (bot)
```

Regla de estilo: módulos por debajo de 400 líneas; cualquier píxel de juego
va al buffer `Uint32Array` (0xAABBGGRR) — el DOM solo muestra mensajes de
estados.

## Historia

Ver `CHANGELOG.md` (etapas 1–7: con los bugs encontrados — incluyendo el
que agotaba el pool de proyectiles tras ~32 tiros — y las métricas de
frame-time y verificación en navegador por etapa).
