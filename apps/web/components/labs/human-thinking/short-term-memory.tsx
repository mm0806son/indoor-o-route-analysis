import React from "react";
import type { HumanRouteFrame } from "@indoor-o-route-analysis/core";

/** Working memory belongs to exploration; final drawing paths are separate. */
export function ShortTermMemory({ frame }: { frame?: HumanRouteFrame }) {
  if (frame?.kind !== "exploration" || !frame.memory) return null;
  return (
    <div className="p-3 border-t border-border text-xs space-y-2">
      <div className="font-medium text-sm mb-1">Short-term memory</div>
      <div>
        <div className="text-muted-foreground">Tracking, from start</div>
        <div className="font-mono">{frame.memory.forwardChain.join(" · ") || "—"}</div>
        {frame.memory.forwardPending.length > 0 && (
          <div className="text-muted-foreground mt-0.5">
            Still to try: {frame.memory.forwardPending.map((p) => p.label ?? "start").join(", ")}
          </div>
        )}
      </div>
      <div>
        <div className="text-muted-foreground">Backtracking, from control</div>
        <div className="font-mono">{frame.memory.backwardChain.join(" · ") || "—"}</div>
        {frame.memory.backwardPending.length > 0 && (
          <div className="text-muted-foreground mt-0.5">
            Still to try: {frame.memory.backwardPending.map((p) => p.label ?? "control").join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
