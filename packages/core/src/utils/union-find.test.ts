import { describe, it, expect } from "vitest";
import { UnionFind } from "./union-find";

describe("UnionFind", () => {
  it("treats every key as its own set until unioned", () => {
    const uf = new UnionFind();
    expect(uf.find("a")).toBe("a");
    expect(uf.find("b")).toBe("b");
    expect(uf.find("a")).not.toBe(uf.find("b"));
  });

  it("merges two sets so their roots become equal", () => {
    const uf = new UnionFind();
    uf.union("a", "b");
    expect(uf.find("a")).toBe(uf.find("b"));
  });

  it("is transitive across chained unions", () => {
    const uf = new UnionFind();
    uf.union("a", "b");
    uf.union("b", "c");
    expect(uf.find("a")).toBe(uf.find("c"));
  });

  it("keeps unrelated keys in separate sets", () => {
    const uf = new UnionFind();
    uf.union("a", "b");
    uf.union("c", "d");
    expect(uf.find("a")).toBe(uf.find("b"));
    expect(uf.find("c")).toBe(uf.find("d"));
    expect(uf.find("a")).not.toBe(uf.find("c"));
  });

  it("is idempotent when unioning already-merged keys", () => {
    const uf = new UnionFind();
    uf.union("a", "b");
    const rootBefore = uf.find("a");
    uf.union("a", "b");
    expect(uf.find("a")).toBe(rootBefore);
    expect(uf.find("b")).toBe(rootBefore);
  });

  it("compresses paths so repeated find() calls stay consistent", () => {
    const uf = new UnionFind();
    uf.union("a", "b");
    uf.union("b", "c");
    uf.union("c", "d");
    const root = uf.find("d");
    expect(uf.find("a")).toBe(root);
    expect(uf.find("b")).toBe(root);
    expect(uf.find("c")).toBe(root);
  });
});
