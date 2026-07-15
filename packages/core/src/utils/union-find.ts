/**
 * A disjoint-set (union-find) structure over string keys, with path
 * compression. Keys are lazily initialized as their own singleton set on
 * first use, so callers never need a separate "add all nodes" pass.
 */
export class UnionFind {
  private readonly parent = new Map<string, string>();

  /** Returns the representative (root) of `x`'s set, compressing the path to it. */
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;

    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  /** Merges the sets containing `a` and `b`. No-op if already in the same set. */
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}
