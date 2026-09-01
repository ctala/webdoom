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

## Datos de inferencia (medidos)

Fuente: contadores Prometheus del vLLM (`qwen38-nvfp4-8001`, `:8001/metrics`)
+ serie de throughput del engine (1 línea cada 10 s en `docker logs`),
recortada a la ventana de trabajo **2026-08-19 06:47 → 2026-08-20 12:50**.
Cobertura: stages 3 (noche) → 7 + SEO. El día 1 (18/08 17:24 → 19/08 06:47)
fue servido por una instancia anterior de vLLM cuyos logs no se conservaron
(LiteLLM sin persistencia de gastos; journald sin tokens por request).

| Métrica | Valor | Nota |
|---------|-------|------|
| Requests con TTFT | **714** | `vllm:time_to_first_token_seconds_count` (incluye el chat de métricas al final; ~700 del experimento) |
| Prompt tokens enviados | **81,08 M** | `vllm:prompt_tokens_total`; ≈ **114 K/request** (contexto grande reenviado por llamada) |
| prompt tokens REALMENTE prefilled | **3,18 M** | integrado de la serie 10 s; el resto lo cubrió el prefix cache |
| **Prefix-cache hit rate** | **93,6 %** | ahorro de cómputo ≈ **25×** en prefill |
| Generation tokens | **728 K** (ventana) · 862 K (contador al 16:20, incluye el chat posterior) | el delta ≈ tokens de la conversación de métricas |
| **Tokens/s de generación (modelo ocupado)** | **≈ 17,8** | 728 K / 683 min; streams sostenidos 11–13 tok/s (config base del modelo: 11,1 single / 138 @16 concurrentes) |
| TTFT promedio | **8,3 s** | 5915,7 s / 714 (prefill de la cola no cachearda de ~114 K) |
| Tiempo del GPU ocupado | **11,4 h** (93,5 % de la ventana) | engine con ≥1 request running |
| Speculative decoding DSpark k=14 | 318.855 pasos draft → **542.602 tokens aceptados** (1,70/paso) | `vllm:spec_decode_num_*` |
| Preemptions | 0 | KV FP8, GPU_UTIL 0,85, 64 GB shm |

Lectura: de los 81 M de tokens de context enviados, al GPU llegaron a
prefill 3,2 M (cache); el trabajo real de decodificación fue ≈ 0,73 M de
tokens generados en 11,4 h de GPU ocupado → **17,8 tok/s efectivos**,
muy lejos del techo del hardware (250+ tok/s @16 concurrentes) porque el
agente trabaja en streaming serial (1 request a la vez, bursts).

Reproducción:
```sh
curl -s localhost:8001/metrics | grep -E "vllm:(prompt|generation|time_to_first_token|spec_decode)_.*"
docker logs qwen38-nvfp4-8001 | grep "loggers.py:310"   # serie 10s para integrar
```

## Run 2 — post-base con Qwen 3.8 Flash Next (NVFP4 vía vLLM)

Desde v1.0.1 las mejoras las construye **Qwen 3.8 Flash Next** (mismo
harness y protocolo de QA; la base 27B queda intacta en v1.0.0). Trazas:
commits `flash:` + tags `v1.x` (base = `v1.0.0`).

Pendiente de completar al cerrar cada sesión, desde LiteLLM/vLLM
(`curl -s localhost:8001/metrics`, ventana = commits `flash:`):

| métrica | valor | fuente |
|---|---|---|
| requests | pend | `vllm:num_requests_total` delta |
| prompt tokens enviados / prefilled | pend | métricas + prefix-cache hit rate |
| generation tokens | pend | `vllm:generation_tokens_total` delta |
| tok/s ocupado / TTFT | pend | serie 10 s + TTFT histogram |

Sesiones: **F1 v1.1.0** (balance + dificultad): 7 ficheros tocados,
+7 tests (151), bench/sweep/playthrough verdes en el mismo commit.
