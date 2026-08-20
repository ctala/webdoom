# WebDoom

FPS estilo Doom completo en el navegador. Cero dependencias, cero assets
binarios: texturas, sprites, sonido y música 100% procedurales
(Canvas2D offscreen + WebAudio). Motor propio sobre un buffer de pixels
empacados 0xAABBGGRR (480x270, escalado 2x, 60 Hz en paso fijo).

## Ejecutar

```sh
python3 -m http.server 8000 --bind 0.0.0.0
# -> http://localhost:8000/   (LAN: http://192.168.88.190:8000/)
```

Es un módulo ES: necesita servirlo por HTTP (file:// no funciona).
`?debug` expone `window.__wd` (el objeto Game) para inspección/QA.

## Controles

| Tecla            | Acción                                    |
|------------------|-------------------------------------------|
| W/A/S/D (o flech.)| mover / strafear                          |
| Ratón            | apuntar (pointer lock)                    |
| Click izq.       | disparar                                  |
| 1 / 2 / 3 / 4    | puños / pistola / escopeta / plasma       |
| E o U            | usar: abrir puertas, secretos, salida     |
| TAB (mantener)   | automapa                                  |
| SHIFT            | correr                                    |
| ENTER            | empezar / reintentar tras morir / salir intermédios |
| ESC              | pausa (overlay PAUSED)                    |

## Niveles

1. **E1M1 HANGAR** — llave roja → puerta R → salida.
2. **E2M1 ARMORY** — llave azul (sala de llaves) → puerta B → salida.

Notas de jugabilidad: las puertas son metal con franjas (roja = llave
roja, azul = llave azul, D sin llave) y se iluminan más que la pared
circundante; el switch de salida es un marcador verde con cruz visible
a distancia; al entrar a un nivel se muestra su objetivo 6 s; al estar
frente a algo interactivo aparece la pista "PRESS E / U - ..." (o
"RED/BLUE KEYCARD NEEDED"). Secuencias completas están cubiertas por
`scripts/qa-playthrough.mjs` (ver abajo).

## Testing y QA

```sh
node --test                    # suite completa (131 tests)
node tests/bench.js            # frame-time por escenario (budget 16.66 ms)
node scripts/qa-browser.mjs    # sweep navegador: 48 posiciones x 8 direcciones
node scripts/qa-playthrough.mjs  # QA DE PROCESO COMPLETO: un bot juega la página real
```

El playthrough (`scripts/qa-playthrough.mjs`) dispara Chromium headless vía
CDP y juega con eventos de teclado reales (W/E/ENTER), usando el A* del
propio juego sobre el grid del nivel: menú → E1M1 (llave roja, puertas,
salida, intermedio) → E2M1 (llave azul, puerta B, salida) → WON. Es
invulnerable a propósito: QA de navegación/interacción, no de combate
(el combate está cubierto por tests + el sweep). Frames en
`/tmp/opencode/shots/`. Requiere `CHROME_BIN` apuntando a un Chromium
headless.

Frames de QA servidos en `_qa/` (`http://localhost:8000/_qa/`).

## Arquitectura

```
index.html            canvas + overlay de mensajes/pausa
src/main.js           input → game, loop rAF, estados DOM
src/engine/           raycaster DDA, renderer (walls/floor/ceil), mapa ASCII,
                      colisión, A*, sprite billboards, luz, pool, FSM
src/gfx/              texturas procedurales + tablas de sombreado, sprites de
                      armas/ítems/enemigos, HUD en buffer (hud.js + font5x7)
src/audio/            sfx sintéticos + música por lookahead (WebAudio)
src/game/             game.js (orquestador, <400 líneas), player, enemigos,
                      armas, projectiles, partículas, ítems, interacción
                      (puertas/salida), automapa
levels/               e1m1.js, e2m1.js (ASCII 32x24)
tests/                node --test (motor, juego, niveles, HUD) + bench
scripts/              qa-browser.mjs (sweep), qa-playthrough.mjs (bot)
```

Regla de estilo: módulos por debajo de 400 líneas; cualquier pixel de
juego va al buffer `Uint32Array` (0xAABBGGRR) — el DOM solo muestra
mensajes de estados.

## Historia

Ver `CHANGELOG.md` (etapas 1–6 con bugs encontrados, métricas de
frame-time y verificación en navegador por etapa).
