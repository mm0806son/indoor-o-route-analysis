"use client";
import { useState } from "react";
import { Save, Link, Trash2 } from "lucide-react";
import {
  inferStairFloor,
  matchStairNodes,
  normalizeStairCode,
} from "@indoor-o-route-analysis/core";
import type { Node, StairNode } from "@indoor-o-route-analysis/core";
import { useStairData } from "./data";

export default function StairNodeEditor({ node }: { node: Node }) {
  const { race, commit, busy, error } = useStairData();
  const [code, setCode] = useState(node.stair?.code ?? "");
  const [floor, setFloor] = useState(
    String(
      node.stair?.floor ??
        (race ? inferStairFloor(node, race) : undefined) ??
        "",
    ),
  );
  const [port, setPort] = useState<StairNode["port"]>(node.stair?.port ?? "up");
  const [message, setMessage] = useState("");
  const save = (connect: boolean) => {
    try {
      if (
        !race ||
        !floor.trim() ||
        !race.stairFloorOrder?.includes(Number(floor))
      )
        throw new Error("Select a floor in the configured floor order.");
      const normalized = normalizeStairCode(code);
      const next = {
        ...race,
        vertices: (race.vertices ?? []).map((n) =>
          n.id === node.id
            ? { ...n, stair: { code: normalized, floor: Number(floor), port } }
            : n,
        ),
      };
      const result = connect
        ? matchStairNodes(next, node.id)
        : { race: next, messages: [] };
      void commit(result.race);
      setMessage(
        result.messages.join("; ") ||
          (connect
            ? "Saved and matched. Existing edges retained."
            : "Saved. Existing edges retained."),
      );
      setCode(normalized);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <fieldset
      className="border rounded p-2 space-y-2 text-xs"
      disabled={busy}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.altKey)) {
          e.preventDefault();
          e.stopPropagation();
          save(e.altKey);
        }
      }}
    >
      <legend>Stair node {node.id}</legend>
      <label className="block">
        Code
        <input
          aria-label="Stair code"
          className="w-full bg-background border rounded p-1"
          value={code}
          placeholder="A, a, A1…"
          onChange={(e) => {
            setCode(e.target.value);
            if (
              e.target.value &&
              e.target.value === e.target.value.toLowerCase()
            )
              setPort("down");
            else if (e.target.value) setPort("up");
          }}
        />
      </label>
      <label className="block">
        Floor
        <select
          aria-label="Stair floor"
          className="w-full bg-background border p-1"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        >
          <option value="">Select floor</option>
          {race?.stairFloorOrder?.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Port
        <select
          aria-label="Stair port"
          className="w-full bg-background border p-1"
          value={port}
          onChange={(e) => setPort(e.target.value as StairNode["port"])}
        >
          <option value="up">Up · A</option>
          <option value="down">Down · a</option>
          <option value="both">Up + down · A/a</option>
        </select>
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          title="Save metadata; keep existing connections (Ctrl/Cmd+Enter)"
          aria-label="Save stair"
          onClick={() => save(false)}
        >
          <Save size={16} />
        </button>
        <button
          type="button"
          title="Save and connect unique adjacent matches (Alt+Enter)"
          aria-label="Save and connect stair"
          onClick={() => save(true)}
        >
          <Link size={16} />
        </button>
        {node.stair && (
          <button
            type="button"
            title="Remove stair annotation; keep edges"
            aria-label="Remove stair annotation"
            onClick={() => {
              if (race)
                void commit({
                  ...race,
                  vertices: race.vertices?.map((n) => {
                    if (n.id !== node.id) return n;
                    const { stair: _, ...plain } = n;
                    return plain;
                  }),
                });
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {(message || error) && <p role="status">{error || message}</p>}
    </fieldset>
  );
}
