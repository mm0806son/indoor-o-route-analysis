"use client";
import { useEffect, useRef } from "react";
import type { MapData, Node, Edge } from "@indoor-o-route-analysis/core";
import { stairNodeLabel } from "@indoor-o-route-analysis/core";
import {
  eventPosToMultiPagePixels,
  type MapViewerState,
} from "@/components/map-viewer";

/** Shared canvas renderer for the stairs screen and course/graph overlays. */
export function drawStairOverlay(
  ctx: CanvasRenderingContext2D,
  nodes: Node[],
  edges: Edge[],
  toPixel: (n: Node) => { x: number; y: number },
  code: string,
  showEdges: boolean,
  selected?: string,
  zoom = 1,
) {
  const size = 1 / Math.max(zoom, 0.05);
  const visible = nodes.filter(
    (n) =>
      n.stair &&
      (code === "*" || n.stair.code.toUpperCase() === code.toUpperCase()),
  );
  const points = new Map(visible.map((n) => [n.id, toPixel(n)]));
  ctx.save();
  ctx.strokeStyle = "#c084fc";
  ctx.fillStyle = "#e9d5ff";
  ctx.lineWidth = 2 * size;
  if (showEdges) {
    ctx.setLineDash([5 * size, 5 * size]);
    for (const e of edges) {
      const a = points.get(e.from),
        b = points.get(e.to);
      if (e.ignoreLength && a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
  const labelBoxes: { x: number; y: number; width: number; height: number }[] =
    [];
  for (const n of visible) {
    const p = points.get(n.id)!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (n.id === selected ? 11 : 8) * size, 0, Math.PI * 2);
    ctx.fillStyle = "#581c87aa";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5 * size;
    ctx.stroke();
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2 * size;
    ctx.stroke();
    ctx.font = `bold ${12 * size}px sans-serif`;
    ctx.lineWidth = 3 * size;
    ctx.strokeStyle = "#171717";
    const text = `${stairNodeLabel(n.stair!)} · ${n.stair!.floor}F`;
    const labelX = p.x + 12 * size;
    const width = text.length * 7 * size;
    let labelY = p.y - 7 * size;
    for (const offset of [-7, 20, -25, 38]) {
      labelY = p.y + offset * size;
      const overlaps = labelBoxes.some(
        (b) =>
          labelX < b.x + b.width &&
          labelX + width > b.x &&
          labelY - 12 * size < b.y + b.height &&
          labelY > b.y,
      );
      if (!overlaps) break;
    }
    labelBoxes.push({
      x: labelX,
      y: labelY - 12 * size,
      width,
      height: 14 * size,
    });
    ctx.strokeText(text, labelX, labelY);
    ctx.fillStyle = "#e9d5ff";
    ctx.fillText(text, labelX, labelY);
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2 * size;
  }
  ctx.restore();
}
export default function StairOverlay({
  state,
  map,
  nodes,
  edges,
  code,
  showEdges = false,
  selectedNode,
  onPick,
  showAllNodes = false,
}: {
  state: MapViewerState;
  map?: MapData;
  nodes: Node[];
  edges: Edge[];
  code: string;
  showEdges?: boolean;
  selectedNode?: string;
  onPick?: (id: string) => void;
  showAllNodes?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const toPixel = (n: Node) =>
      eventPosToMultiPagePixels(n, map, state.pixelsPerMM);
    if (showAllNodes) {
      ctx.fillStyle = "#888";
      for (const n of nodes) {
        const p = toPixel(n);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawStairOverlay(
      ctx,
      nodes,
      edges,
      toPixel,
      code,
      showEdges,
      selectedNode,
      state.zoom,
    );
  }, [
    state.pdfDimensions.width,
    state.pdfDimensions.height,
    state.pixelsPerMM,
    state.zoom,
    map,
    nodes,
    edges,
    code,
    showEdges,
    selectedNode,
    showAllNodes,
  ]);
  return (
    <canvas
      ref={ref}
      aria-label="Stair map highlights"
      data-stair-code={code}
      width={state.pdfDimensions.width}
      height={state.pdfDimensions.height}
      style={{
        position: "absolute",
        inset: 0,
        userSelect: "none",
        pointerEvents: onPick ? "auto" : "none",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!onPick || e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / state.zoom,
          y = (e.clientY - rect.top) / state.zoom;
        const hit = nodes
          .map((n) => ({
            n,
            p: eventPosToMultiPagePixels(n, map, state.pixelsPerMM),
          }))
          .filter(({ p }) => Math.hypot(p.x - x, p.y - y) < 10 / state.zoom)
          .sort(
            (a, b) =>
              Math.hypot(a.p.x - x, a.p.y - y) -
              Math.hypot(b.p.x - x, b.p.y - y),
          )[0];
        if (hit) {
          e.stopPropagation();
          onPick(hit.n.id);
        }
      }}
      onMouseMove={(e) => e.preventDefault()}
    />
  );
}
