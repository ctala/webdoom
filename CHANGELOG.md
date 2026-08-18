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
