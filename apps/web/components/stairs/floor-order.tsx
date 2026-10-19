"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import { validateFloorOrder } from "@indoor-o-route-analysis/core";
import { useStairData } from "./data";

export default function FloorOrder() {
  const { race, commit, busy, error } = useStairData();
  const candidates = [
    ...new Set(
      (race?.polygons ?? []).flatMap((p) =>
        p.level === undefined ? [] : [p.level],
      ),
    ),
  ].sort((a, b) => a - b);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const saved = (race?.stairFloorOrder ?? []).join(", ");
  return (
    <fieldset className="border rounded p-2 space-y-1 text-xs" disabled={busy}>
      <legend>Floor order · lowest → highest</legend>
      <div className="flex gap-1">
        <input
          aria-label="Floor order"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.parentElement?.querySelector("button")?.click();
            }
          }}
          className="bg-background border rounded p-1 min-w-0 flex-1"
          value={draft ?? saved}
          placeholder={candidates.join(", ")}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          title="Save floor order (Enter)"
          aria-label="Save floor order"
          onClick={() => {
            try {
              const text = draft ?? saved;
              if (!text.trim() || text.split(",").some((s) => !s.trim()))
                throw new Error("Enter comma-separated floor numbers.");
              const order = text.split(",").map(Number);
              validateFloorOrder(order);
              if (race) void commit({ ...race, stairFloorOrder: order });
              setDraft(null);
              setMessage(
                "Saved. Existing edges retained; check stair diagnostics.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <Save size={16} />
        </button>
      </div>
      <p className="text-muted-foreground">
        Candidates: {candidates.join(", ") || "set polygon levels in 3D Model"}.
        Include floors with missing stair nodes.
      </p>
      {(message || error) && <p role="status">{error || message}</p>}
    </fieldset>
  );
}
