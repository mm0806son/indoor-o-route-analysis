import { describe, it, expect, vi } from "vitest";
import { drawStairOverlay } from "./overlay";
import type { Node } from "@indoor-o-route-analysis/core";
vi.mock("@/components/map-viewer", () => ({
  eventPosToMultiPagePixels: (p: unknown) => p,
}));
const nodes: Node[] = [
  { id: "a", x: 10, y: 10, stair: { code: "A1", floor: 1, port: "up" } },
  { id: "b", x: 20, y: 20, stair: { code: "A1", floor: 2, port: "down" } },
  { id: "c", x: 30, y: 30, stair: { code: "B", floor: 1, port: "both" } },
];
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
describe("shared stair highlights", () => {
  it("empty selection draws no stair highlights while All draws every node", () => {
    const ctx = context();
    drawStairOverlay(ctx, nodes, [], (n) => n, "", false);
    expect(ctx.arc).not.toHaveBeenCalled();
    drawStairOverlay(ctx, nodes, [], (n) => n, "*", false);
    expect(ctx.arc).toHaveBeenCalledTimes(3);
  });
  it("matches identity case-insensitively and draws only selected stair connections", () => {
    const ctx = context();
    drawStairOverlay(
      ctx,
      nodes,
      [{ from: "a", to: "b", label: "A1", ignoreLength: true }],
      (n) => n,
      "a1",
      true,
    );
    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.lineTo).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith(
      "a1 · 2F",
      expect.any(Number),
      expect.any(Number),
    );
  });
  it("keeps highlights legible at overview zoom", () => {
    const ctx = context();
    drawStairOverlay(ctx, nodes, [], (n) => n, "A1", false, undefined, 0.5);
    expect(ctx.arc).toHaveBeenCalledWith(10, 10, 16, 0, Math.PI * 2);
    expect(ctx.font).toBe("bold 24px sans-serif");
  });
});
