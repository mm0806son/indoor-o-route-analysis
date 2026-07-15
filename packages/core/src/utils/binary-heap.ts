/**
 * A generic binary heap (priority queue).
 *
 * The supplied comparator defines ordering: `pop()` returns the item for which
 * `compare(item, other) <= 0` against all others — i.e. a min-heap when the
 * comparator returns `a - b`. Operations are O(log n); `peek`/`size` are O(1).
 */
export class BinaryHeap<T> {
  private readonly items: T[] = [];

  /**
   * @param compare - Ordering function. Negative if `a` should pop before `b`,
   *   positive if after, zero if equal. Use `(a, b) => a - b` for a numeric
   *   min-heap.
   */
  constructor(private readonly compare: (a: T, b: T) => number) {}

  /** Number of items currently in the heap. */
  get size(): number {
    return this.items.length;
  }

  /** The next item to be popped, without removing it, or undefined if empty. */
  peek(): T | undefined {
    return this.items[0];
  }

  /** Insert an item, restoring the heap invariant by sifting up. */
  push(item: T): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(items[parent], items[i]) <= 0) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  /** Remove and return the smallest item, or undefined if the heap is empty. */
  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      const n = items.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.compare(items[l], items[smallest]) < 0) smallest = l;
        if (r < n && this.compare(items[r], items[smallest]) < 0) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}
