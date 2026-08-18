// A* on the cell grid (4-neighbourhood), allocation-free after construction.
// Open list: flat Int32Array + parallel score; linear min-scan (n is small).
// Ties on f resolve to the node with the larger g (deeper), keeping the
// expansion narrow. Stale list entries are dropped on pop.

const CAP = 4096;

export class AStar {
  constructor() {
    this.cost = new Float32Array(CAP);
    this.best = new Float32Array(CAP);
    this.prev = new Int32Array(CAP);
    this.stamp = new Uint16Array(CAP);
    this.open = new Int32Array(CAP);
    this.openF = new Float32Array(CAP);
    this.openLen = 0;
    this.gen = 0;
    this.gw = 0;
  }

  /**
   * @returns number of cells in path (grid indices y*gw+x) or 0 if impossible.
   */
  find(sx, sy, tx, ty, solid, gw, gh, out) {
    this.gw = gw;
    const S = sy * gw + sx;
    const T = ty * gw + tx;
    if (gw * gh > CAP) return 0;
    if (solid[S] || solid[T]) return 0;
    if (S === T) { out[0] = S; return 1; }
    this.gen++;
    const gen = this.gen;
    this.openLen = 1;
    this.open[0] = S;
    this.openF[0] = this.h(S, T);
    this.stamp[S] = gen;
    this.cost[S] = 0;
    this.prev[S] = -1;
    this.best[S] = this.h(S, T);
    const MAX_ITER = 4096;
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let bi = 0;
      for (let i = 1; i < this.openLen; i++) {
        const f1 = this.openF[i];
        const b0 = this.openF[bi];
        if (f1 < b0 || (f1 === b0 && this.cost[this.open[i]] > this.cost[this.open[bi]])) bi = i;
      }
      const cur = this.open[bi];
      const curF = this.openF[bi];
      this.open[bi] = this.open[--this.openLen];
      if (curF > this.best[cur]) continue; // stale entry
      if (cur === T) {
        let n = 0;
        let c = T;
        while (c !== -1) { out[n++] = c; c = this.prev[c]; }
        for (let i = 0; i < (n / 2) | 0; i++) {
          const a = out[i]; out[i] = out[n - 1 - i]; out[n - 1 - i] = a;
        }
        return n;
      }
      const gc = this.cost[cur];
      const cx = cur % gw;
      const cy = (cur / gw) | 0;
      if (cx + 1 < gw) this.push(cur + 1, cur, gc + 1, solid, T);
      if (cx > 0) this.push(cur - 1, cur, gc + 1, solid, T);
      if (cy + 1 < gh) this.push(cur + gw, cur, gc + 1, solid, T);
      if (cy > 0) this.push(cur - gw, cur, gc + 1, solid, T);
    }
    return 0;
  }

  push(n, from, ng, solid, T) {
    if (solid[n] || this.openLen >= CAP - 1) return;
    const gen = this.gen;
    if (this.stamp[n] === gen && ng >= this.cost[n]) return;
    this.stamp[n] = gen;
    this.cost[n] = ng;
    this.prev[n] = from;
    const f = ng + this.h(n, T);
    this.best[n] = f;
    this.open[this.openLen] = n;
    this.openF[this.openLen] = f;
    this.openLen++;
  }

  h(a, b) {
    const aw = this.gw;
    const ax = a % aw, ay = (a / aw) | 0;
    const bx = b % aw, by = (b / aw) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }
}
