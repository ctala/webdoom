# TODO — plan de mejoras post-base

Procedencia: la BASE (v1.0.0, motor + 3 niveles + QA, 45.8h) la construyó
**Qwen3.8 27B** (NVFP4 vía vLLM). Todo lo de este plan lo construye
**Qwen 3.8 Flash Next** (NVFP4 vía vLLM) → commits con prefijo `flash:`.

## Versionado (estándar)

- Semver en `package.json`. Base = **v1.0.0**.
- feature (nueva mecánica/arma/nivel) → `1.x.0` · fix/balance → `1.x.y`
- Cada sección del CHANGELOG lleva tag `[base 27B]` o `[flash]`.

## Etapas

- [x] **0. Procedencia + estándar de versionado** → v1.0.1 (doc puro, plegado en el commit de v1.1.0)
  - [x] README: Origen (27B) + Mejoras post-base (Flash Next)
  - [x] CHANGELOG: tag por etapa + sección de versionado
  - [x] EXPERIMENTS: planilla de métricas del run Flash Next (pend: tokens
        del run actual — completar desde LiteLLM/vLLM al cerrar la sesión)
- [x] **1. Balance + dificultad** → v1.1.0
  - [x] Hitscan con falloff (`damageFalloff` ya existe): pistola range 11,
        daño 10-30 → 8-16; escopeta range 7
  - [x] Warden: 450→550 hp, range 11→8, `press:5` (avanza hasta 5u en vez de
        kitear inofensivo desde 11) — ya no se le mata de lejos con pistola
  - [x] `src/game/difficulty.js`: ITYTD / Hurt Me Plenty / Ultra Violence /
        Nightmare (dmg recibido ×, cadencia enemiga ×, munición ×)
  - [x] Selección en el menú con ←/→ + persistencia (localStorage)
  - [x] Tests: falloff, multiplicadores de dificultad, Warden cierra distancia
- [x] **1.5. Dificultad con mobs + UX** → v1.2.0: mobMul (ITYTD ralea,
      NM duplica), cambio en YOU DIED (1-4/←/→), selector visible con `*`.
      Fix: `s.enraged` se reseteaba nunca (slot reuse).
- [x] **2. Game feel** → v1.3.0: ✅ screen shake, patada viewmodel, viñeta roja,
      audio posicional (StereoPanner desde `game.sound[]`), fix puños
      (backlog CHANGELOG:195)
- [x] **3. Luces dinámicas + gibs** → v1.4.0: ✅ pool ≤8 luces puntuales
      (fogonazo/plasma/explosión) en el renderer; gibs al morir
- [x] **4. Cohete + ametralladora** → v1.5.0: ✅ proyectil con splash (daña al
      jugador cerca), chaingun con spread creciente; sprites + sonidos
- [x] **5. Enemigos nuevos** → v1.6.0: ✅ Lost Soul (melee veloz), Baron (duro,
      doble bolt), Pain Elemental (spawn imps, respeta ENEMY_MAX=48). Colocados en E2M1/E3M1.
- [x] **6a. Items + hazards** → v1.7.0: ✅ berserk, megasphere, invisibilidad,
- [x] **6b. E4M1/E5M1 + jefe final** → v1.8.0: ✅ E4 hub multi-llave; E5 usa
      `heights` 2/3 + THE OVERLORD 2 fases. Bot de playthrough generico por niveles.
- [x] **7. Meta** → v1.9.0: guardado/continuar (localStorage), stats de
      nivel (kills %/secrets %/tiempo), ajustes FOV/gamma/sens (teclas).
- [x] **8. Pitch (mirar arriba/abajo)** → v2.0.0: ✅ renderer + spriteRenderer +
      partículas. Riesgoso: último, 2-3 sesiones.

## Verificación por etapa (reglas del repo)

```sh
node --test                                  # todo verde
node tests/bench.js                          # < 16.66 ms/frame
node scripts/qa-browser.mjs                  # sweep CLEAN
CHROME_BIN=... node scripts/qa-playthrough.mjs   # bot llega a WON
```
