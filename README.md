# WebDoom

FPS estilo Doom completo en el navegador. Cero dependencias, cero assets
binarios: texturas, sprites, sonido y música 100% procedurales
(Canvas2D offscreen + WebAudio). Motor propio sobre un buffer de píxeles
empacados 0xAABBGGRR (480x270, escalado 2x, 60 Hz en paso fijo).

## Origen

Este proyecto es un **experimento con Spark usando Qwen3.8 (27B, nvfp4 via
vLLM)**: todo el motor, los niveles, el HUD, el audio y hasta la suite de QA
fue construido por el modelo en 7 etapas, de forma autónoma; la persona solo
jugó, reportó bugs de jugada ("no encuentro la salida", "el jefe no cae") y
dio la dirección. Sin assets, sin librerías, sin build step: es puro
HTML + módulos ES. Ver `EXPERIMENTS.md` (cronología por commit, métricas,
12 bugs hallados por la QA del agente y la planilla de datos de inferencia)
y `CHANGELOG.md` para el registro técnico etapa por etapa.

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

## Controles

| Tecla            | Acción                                    |
|------------------|-------------------------------------------|
| W/A/S/D (o flech.)| mover / strafear                          |
| Ratón            | apuntar (pointer lock)                    |
| Click izq. / Espacio | disparar                               |
| 1 / 2 / 3 / 4 (o rueda) | puños / pistola / escopeta / plasma |
| E o U            | usar: abrir puertas, secretos, salida     |
| TAB (mantener)   | automapa                                  |
| SHIFT            | correr                                    |
| ENTER            | empezar / reintentar tras morir / saltar intermedio |
| ESC              | pausa (overlay PAUSED)                    |

## Niveles

1. **E1M1 HANGAR** — llave roja → puerta R → salida.
2. **E2M1 ARMORY** — llave azul (sala de llaves) → puerta B → salida.
3. **E3M1 THE PIT** — arena de **jefe: THE WARDEN**. Mátilo y la salida
   (sellada mientras vive) te da el **WON**.

Notoriedad: el juego siempre dice qué hay que hacer **y hacia dónde** —
triángulo-compás en el borde superior (rumbo + distancia al objetivo) y
banner permanente abajo ("FIND THE RED KEYCARD" / "DEFEAT THE WARDEN" /
"REACH THE EXIT"); el automapa (TAB) marca el objetivo con un rombo aunque
no hayas explorado esa zona. El switch de salida es un **arco verde con
placa "EXIT"** visible a distancia (ya no parece un medpack). Puertas con
llave piden el keycard ("RED/BLUE KEYCARD NEEDED").

## Testing y QA

```sh
node --test                      # suite completa (144 tests)
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
                      (incl. THE WARDEN: ráfaga 3 bolts, enfurece a <45% hp),
                      armas, projectiles, partículas, ítems, interacción
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
