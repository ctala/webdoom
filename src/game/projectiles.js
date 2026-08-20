// Pooled projectiles (enemy fire/bolts now; player plasma + splats in stage 4).
// owner: 0 = enemy (hits player), 1 = player (hits enemies).

export function updateProjectiles(game, dt) {
  const { gw, gh } = game.map;
  const view = game.view;
  const p = game.player;
  const pool = game.projectiles;
  pool.each((pr) => {
    if (!pr.active) return;
    pr.life -= dt;
    if (pr.life <= 0) { pr.active = false; pool.release(pr); return; }
    // substep 2x so fast bolts never skip a 1-cell wall at 60Hz
    for (let s = 0; s < 2; s++) {
      pr.x += pr.vx * dt * 0.5;
      pr.y += pr.vy * dt * 0.5;
      const cx = Math.floor(pr.x), cy = Math.floor(pr.y);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh || view[cy * gw + cx]) {
        pr.active = false;
        pool.release(pr);
        game.onProjectileWall(pr);
        return;
      }
      if (pr.owner === 0) {
        const dx = pr.x - p.x, dy = pr.y - p.y;
        if (dx * dx + dy * dy < 0.13) {
          pr.active = false;
          pool.release(pr);
          game.hurtPlayer(pr.dmg, pr.x, pr.y);
          game.emitSound(pr.x, pr.y, 6);
          return;
        }
      } else {
        for (let i = 0; i < game.enemyCount; i++) {
          const e = game.enemies[i];
          if (e.state === 5 || e.state === 6) continue; // DEATH/CORPSE
          const def = game.enemyDef[e.type];
          const dx = pr.x - e.x, dy = pr.y - e.y;
          if (dx * dx + dy * dy < def.r * def.r + 0.09) {
            pr.active = false;
            pool.release(pr);
            game.onProjectileHitEnemy(pr, e);
            return;
          }
        }
      }
    }
  });
}
