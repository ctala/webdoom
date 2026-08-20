# EXPERIMENTS — registro del experimento

Qué es: FPS completo (motor, 3 niveles, jefe, audio, HUD, suite de QA)
generado por el modelo **Qwen3.8 27B (NVFP4, vLLM) vía LiteLLM**, operado
como agente de terminal (Spark) dentro de `opencode`. Flujo: el modelo
planifica, escribe código, corre tests/QA de navegador y commitea por
etapas; la persona juega el juego servido, reporta bugs de jugada y marca
la dirección. Sin librerías, sin assets binarios, sin build step.

## Cronología (git, por commit)

| Commit   | Fecha (UTC+local)  | Etapa                                                        | Tests |
|----------|--------------------|--------------------------------------------------------------|-------|
| `4a2fad9`| 2026-08-18 17:24   | 1: loop fijo, raycaster DDA, colisión, A*, FSM, E1M1         | 57    |
| `16d2f2f`| 2026-08-18 18:01   | 2: texturas procedurales + floor/ceiling casting (+37 min)   | 64    |
| `88d7e5b`| 2026-08-18 22:34   | 3: sprites billboards, 4 enemigos, proyectiles + QA browser  | 78    |
| `a7060f2`| 2026-08-19 07:59   | fix puerta (doorH) + sweep CDP sistémico (qa-browser.mjs)    | 81    |
| `ba11e1d`| 2026-08-19 10:58   | pantalla de muerte + error log + pausa determinista          | 82    |
| `bf176d6`| 2026-08-19 15:28   | 4: armas, sangre, decals, viewmodels, audio WebAudio + pulido| 100   |
| `52b5650`| 2026-08-19 18:01   | 5: interacción real (E/U), ítems, llaves, E2M1, progresión   | 116   |
| `f7058d4`| 2026-08-19 20:14   | 6: HUD en buffer, menú, automapa, notoriedad + playthrough QA| 131   |
| `3eff22f`| 2026-08-20 10:52   | 7: objetivo/brújula, jefe WARDEN + E3M1, fix pool crítico    | 144   |
| `882ae44`| 2026-08-20 11:11   | SEO/OG + favicon                                              | 144   |

- **Tiempo cronológico total**: 2026-08-18 17:24 → 2026-08-20 11:11 =
  **~45.8 h** (incluye pausas de ~9.4 h y ~14.6 h donde la persona jugó y
  reportó bugs; el tiempo "activo de código" entre commits es ≈ **21-22 h**).
- **Commits**: 14 · **SLOC final**: 6,925 líneas (6,925 = todo el sitio;
  `src/` solo: 3,813) · **0 dependencias** (package.json solo define
  scripts de test) · **0 assets binarios**.

## Resultados medidos

- **144 tests** (`node --test`) pasando; **sweep de navegador CLEAN**
  (48 posiciones × 8 direcciones + soak 45 s, 0 errores de consola).
- **Playthrough real**: bot en la página real (eventos de teclado reales,
  A* del propio juego) juega MENÚ→E1M1→E2M1→E3M1, mata al jefe con plasma
  y termina en WON, ~3 min, 0 errores de página.
- **Frame time** (CPU, V8 480x270): escena más pesada (arena del jefe:
  boss + 3 escoltas + plasma + HUD) **1.35 ms/frame** vs presupuesto
  16.66 ms → 12× margen.

## Bugs hallados por el QA del agente (y cómo)

1. CanvasProxy sincronizaba desde `createImageData` vacío → pantalla negra
   (browser-only; tests node no lo cubren).
2. `buildGlowSprites` leía el canal de otro texel (alpha basura).
3. Radio negativa a `ellipse()` → `IndexSizeError` (el stub no lanza).
4. **`map.doorH` nunca cableado** → crash al VER una puerta (reportado por
   la persona; root cause vía sweep CDP; regresión con test).
5. Muerte sin feedback + loop rAF sin guard (reportado: "se me quedó
   pegado").
6. Pausa disparada 2× (keydown + pointerlockchange).
7. sfx en silencio tras ~1 s (agendamiento en tiempo absoluto, no en el
   reloj vivo del AudioContext) — confirmado por la persona.
8. Cambio de arma armaba el swing de disparo (parecía un tiro).
9. Muros muestreaban siempre la columna 0 de la textura (bandas, no
   ladrillos) — hallado durante stage 4.
10. **`input.use` nunca se leía**: las puertas jamás se abrían en el juego
    real (tests movían `doorH` a mano) — la persona no podía avanzar.
11. **Pool de proyectiles/partículas sin `release()`**: tras ~32 tiros el
    free-list se agotaba y balas enemigas y plasma dejaban de existir en
    silencio — hallado depurando el bot de playthrough (haría el mismo
    efecto a la persona en combate real).
12. Favicon 404 + 404s de fondo de Chrome hacían fallar el sweep (flaky).

Categoría de detección: 4 reportados por la persona jugando (3, 4, 5, 7
parcial) y 8 por la QA automatizada del agente (browser-only o logic-only).

## Datos de inferencia (PARA COMPLETAR — del lado de Spark/LiteLLM/vLLM)

El agente no ve sus propios counters de tokens desde el interior de la
sesión: estos datos salen del proxy (LiteLLM) o del servidor vLLM.

| Métrica                      | Valor | Dónde salir |
|------------------------------|-------|-------------|
| Requests (llamadas a modelo) |       | LiteLLM → Spend/Logs (`/spend/logs`), filtrar por `spark-litellm/qwen3.8-27b-nvfp4-vllm` |
| Prompt tokens (suma)         |       | mismo endpoint (`usage` por request) |
| Completion tokens (suma)     |       | ibidem |
| Coste (si aplica)            |       | ibidem |
| TTFT p50 / p99               |       | vLLM Prometheus (`/metrics` con `--enable-metrics`): `vllm:time_to_first_token_seconds` |
| Inter-token latency          |       | `vllm:time_per_output_token_seconds` |
| **Tokens/s promedio (output)** |     | completion tokens / tiempo ocupado por el modelo (NO por tiempo de muro: hay interacciones humanas y ejecución de herramientas entre llamadas) |
| Peak concurrent requests     |       | `vllm:num_requests_running` |

Notas metodológicas:
- "Tiempo del experimento" ≠ "tiempo de generación": entre dos llamadas
  hay ejecución de tests/QA (minutos) y respuesta humana (horas). Para
  tokens/s real, usar sólo la suma de `completion_tokens / latencia` por
  request ponderada, o el histograma de vLLM.
- Si LiteLLM registra por request: `tokens/s ≈ Σ completion_tokens / Σ
  (completion_tokens / rate_reported)`.
- Snapshot útil: exportar los logs de LiteLLM del rango
  2026-08-18T17:00 → 2026-08-20T11:30 a CSV.
