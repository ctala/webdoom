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
