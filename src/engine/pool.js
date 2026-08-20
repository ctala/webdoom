// Fixed-size pool with an index free-list. Zero allocation after init.
// acquire() returns an item (never `new` again); release() by reference.

export class Pool {
  /**
   * @param {number} count
   * @param {(i:number)=>object} factory
   */
  constructor(count, factory) {
    this.items = new Array(count);
    this.free = new Int32Array(count);
    this.top = count;
    for (let i = 0; i < count; i++) {
      const it = factory(i);
      it._poolIdx = i;
      this.items[i] = it;
      this.free[i] = i;
    }
  }

  acquire() {
    if (this.top === 0) return null;
    const i = this.free[--this.top];
    return this.items[i];
  }

  release(it) {
    this.free[this.top++] = it._poolIdx;
  }

  /** @param {Function} fn called on every item regardless of state */
  each(fn) {
    for (let i = 0; i < this.items.length; i++) fn(this.items[i]);
  }

  get size() { return this.items.length; }
  /** How many slots are back in the free list (diagnostics/tests). */
  get freeCount() { return this.top; }
}
