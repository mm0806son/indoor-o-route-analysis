import type { Control, Node } from "@indoor-o-route-analysis/core";
import type { VizLayout } from "@indoor-o-route-analysis/core/render";

/**
 * Fits every graph node/control's map coordinate into a width x height pixel
 * canvas (with margin), preserving aspect ratio, so the whole graph is
 * always visible regardless of the leg's position within it.
 */
export function computeLayout(
  nodes: Node[],
  controls: Control[],
  width: number,
  height: number,
  margin = 40
): VizLayout {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const points: Array<{ id: string; x: number; y: number }> = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
  for (const c of controls) {
    if (!nodeIds.has(c.id)) {
      points.push({ id: c.id, x: c.mapPosition.x, y: c.mapPosition.y });
    }
  }

  if (points.length === 0) {
    return { positions: new Map(), width, height };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const availW = Math.max(1, width - margin * 2);
  const availH = Math.max(1, height - margin * 2);
  const scale = Math.min(availW / spanX, availH / spanY);

  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = margin + (availW - drawW) / 2;
  const offsetY = margin + (availH - drawH) / 2;

  const positions = new Map<string, { x: number; y: number }>();
  for (const p of points) {
    positions.set(p.id, {
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    });
  }

  return { positions, width, height };
}
