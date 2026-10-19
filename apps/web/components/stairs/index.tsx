"use client";
import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Link,
  Unlink,
  Info,
  Undo2,
  Redo2,
  Scan,
  RefreshCw,
  Eye,
  X,
} from "lucide-react";
import { useAppData, usePdfUrl } from "@indoor-o-route-analysis/ui";
import {
  connectStairNodes,
  convertLegacyStairs,
  diagnoseStairs,
  getActiveMap,
  matchStairNodes,
  stairNodeLabel,
} from "@indoor-o-route-analysis/core";
import MapViewer, {
  eventPosToMultiPagePixels,
  type MapViewerController,
  type MapViewerState,
} from "@/components/map-viewer";
import FloorOrder from "./floor-order";
import StairNodeEditor from "./node-editor";
import StairOverlay from "./overlay";
import StairSelector from "./selector";
import { useStairData } from "./data";

export default function StairsView() {
  const { selectedEvent, selectedCourseId, pdfBlobUrl } = useAppData();
  const { race, commit, busy, error, undo, redo, canUndo, canRedo } =
    useStairData();
  const map = getActiveMap(selectedEvent ?? undefined, selectedCourseId);
  const { pdfUrl } = usePdfUrl(map, pdfBlobUrl);
  const [code, setCode] = useState("*"),
    [selected, setSelected] = useState(""),
    [source, setSource] = useState("");
  const [showEdges, setShowEdges] = useState(true),
    [info, setInfo] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<MapViewerController | null>(null),
    state = useRef<MapViewerState | null>(null);
  const nodes = race?.vertices ?? [],
    edges = race?.edges ?? [];
  const node = nodes.find((n) => n.id === selected);
  const visible = nodes.filter(
    (n) => n.stair && (code === "*" || n.stair.code.toUpperCase() === code),
  );
  const pick = (id: string) => {
    if (source && race) {
      try {
        let next: typeof race;
        try {
          next = connectStairNodes(race, source, id);
        } catch (e) {
          if (!(e as Error).message.startsWith("Missing intermediate")) throw e;
          if (
            !window.confirm(
              "These nodes skip configured floors. Create an explicit cross-floor connection?",
            )
          )
            return;
          next = connectStairNodes(race, source, id, true);
        }
        void commit(next);
        setMessage("Connected.");
        setSource("");
      } catch (e) {
        setMessage((e as Error).message);
      }
    }
    setSelected(id);
  };
  const focus = (ids: string[]) => {
    if (!state.current || !controller.current) return;
    const points = nodes
      .filter((n) => ids.includes(n.id))
      .map((n) =>
        eventPosToMultiPagePixels(n, map, state.current!.pixelsPerMM),
      );
    if (!points.length) return;
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    controller.current.frameItem(
      { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      Math.min(
        2,
        Math.max(
          0.05,
          Math.min(
            (window.innerWidth - 400) / (maxX - minX + 100),
            (window.innerHeight - 180) / (maxY - minY + 100),
          ),
        ),
      ),
    );
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          "input,select,textarea,[contenteditable=true]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
        return;
      }
      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowEdges((v) => !v);
      }
      if (e.key === "Escape") {
        setSource("");
        setCode("");
        setInfo(false);
      }
      if (e.key === "?") {
        e.preventDefault();
        setInfo((v) => !v);
      }
      if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        focus(visible.map((n) => n.id));
      }
      if (
        e.key.toLowerCase() === "c" &&
        node?.stair &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        setSource(node.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <MapViewer
        pdfUrl={pdfUrl ?? undefined}
        mapLayout={map?.layout || "horizontal"}
        onControllerReady={(c) => {
          controller.current = c;
        }}
      >
        {(s) => {
          state.current = s;
          return (
            <StairOverlay
              state={s}
              map={map}
              nodes={nodes}
              edges={edges}
              code={code}
              showEdges={showEdges}
              selectedNode={selected}
              onPick={pick}
              showAllNodes
            />
          );
        }}
      </MapViewer>
      <aside className="w-80 shrink-0 overflow-auto border-l p-2 space-y-3 text-xs">
        <div className="flex gap-3 items-center">
          <strong className="flex-1">Stairs</strong>
          <button
            type="button"
            title="Fit all highlighted nodes (F)"
            aria-label="Fit stairs"
            onClick={() => focus(visible.map((n) => n.id))}
          >
            <Scan size={16} />
          </button>
          <button
            type="button"
            title="Toggle connecting lines (L)"
            aria-label="Toggle stair edges"
            onClick={() => setShowEdges((v) => !v)}
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            title="Undo stair operation (Ctrl/Cmd+Z)"
            aria-label="Undo stair operation"
            disabled={!canUndo || busy}
            onClick={() => void undo()}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            title="Redo stair operation (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo stair operation"
            disabled={!canRedo || busy}
            onClick={() => void redo()}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            title="Stairs guide (?)"
            aria-label="Stairs guide"
            onClick={() => setInfo((v) => !v)}
          >
            <Info size={16} />
          </button>
        </div>
        <FloorOrder />
        <StairSelector allowAll race={race} value={code} onChange={setCode} />
        <div className="flex gap-3">
          <button
            type="button"
            title="Convert legacy stair edges; preserve all edges"
            aria-label="Convert legacy stairs"
            disabled={busy}
            onClick={() => {
              try {
                if (race) {
                  const r = convertLegacyStairs(race);
                  void commit(r.race);
                  setMessage(
                    r.messages.join("\n") ||
                      "Converted stair annotations. All edges preserved.",
                  );
                }
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            title="Explicitly connect all unique adjacent matches"
            aria-label="Connect matching stairs"
            disabled={busy}
            onClick={() => {
              try {
                if (race) {
                  const r = matchStairNodes(race);
                  void commit(r.race);
                  setMessage(
                    r.messages.join("\n") || "Connected unique matches.",
                  );
                }
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <Link size={16} />
          </button>
        </div>
        {(message || error) && (
          <pre
            role="status"
            className="whitespace-pre-wrap max-h-36 overflow-auto"
          >
            {error || message}
          </pre>
        )}
        {source && (
          <p role="status" className="text-purple-300">
            Connecting from {source}: click a target node or its row. Esc
            cancels.
          </p>
        )}
        <details>
          <summary>Graph nodes ({nodes.length})</summary>
          <select
            aria-label="Select graph node"
            className="bg-background border w-full"
            value={selected}
            onChange={(e) => pick(e.target.value)}
          >
            <option value="">Select node</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.id}
                {n.stair
                  ? ` · ${stairNodeLabel(n.stair)} ${n.stair.floor}F`
                  : ""}
              </option>
            ))}
          </select>
        </details>
        {node && (
          <>
            <StairNodeEditor
              key={`${node.id}:${JSON.stringify(node.stair)}`}
              node={node}
            />
            {node.stair && (
              <button
                type="button"
                title="Choose this node, then click the target (C)"
                aria-label="Connect selected stair by click"
                className="p-1 border rounded"
                onClick={() => setSource(node.id)}
              >
                <Link size={16} />
              </button>
            )}
          </>
        )}
        <div className="space-y-1">
          {visible.map((n) => (
            <div
              key={n.id}
              className={`flex gap-2 items-center rounded p-1 ${n.id === selected ? "bg-purple-900" : ""}`}
            >
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => pick(n.id)}
              >
                {stairNodeLabel(n.stair!)} · {n.stair!.floor}F · {n.id}
              </button>
              <button
                type="button"
                title={`Locate node ${n.id}`}
                aria-label={`Locate node ${n.id}`}
                onClick={() => focus([n.id])}
              >
                <Crosshair size={14} />
              </button>
            </div>
          ))}
        </div>
        {node && (
          <details open>
            <summary>Connections</summary>
            {edges
              .filter((e) => e.from === node.id || e.to === node.id)
              .map((e, i) => (
                <div className="flex gap-2 py-1" key={i}>
                  <span className="flex-1">
                    {e.from} ↔ {e.to} · {e.label}/{e.reverseLabel}
                  </span>
                  <button
                    type="button"
                    title="Disconnect; stays disconnected until explicitly connected"
                    aria-label={`Disconnect ${e.from} ${e.to}`}
                    onClick={() => {
                      if (race)
                        void commit({
                          ...race,
                          edges: edges.filter((x) => x !== e),
                        });
                    }}
                  >
                    <Unlink size={14} />
                  </button>
                </div>
              ))}
          </details>
        )}
        <details>
          <summary>
            Diagnostics ({race ? diagnoseStairs(race).length : 0})
          </summary>
          <ul className="list-disc pl-4">
            {race && diagnoseStairs(race).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </details>
      </aside>
      {info && (
        <div
          role="dialog"
          aria-label="Stairs guide"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
        >
          <div className="bg-background border rounded p-5 max-w-lg space-y-3 text-sm">
            <button
              type="button"
              className="float-right"
              title="Close guide"
              onClick={() => setInfo(false)}
            >
              <X size={16} />
            </button>
            <strong>Stairs guide</strong>
            <p>
              Configure floors lowest to highest, including floors with no stair
              nodes. A/a identify the same staircase: uppercase up, lowercase
              down, A/a both. Connections are always bidirectional.
            </p>
            <p>
              Select graph nodes to annotate. Save (Ctrl/Cmd+Enter in the node
              form) keeps existing edges. Save and connect creates unique
              adjacent matches. C starts click-to-connect; click the destination
              without dragging. Missing or ambiguous targets require explicit
              selection.
            </p>
            <p>
              Convert legacy stairs adds metadata only, checking labels against
              polygon floors. Conflicts remain in diagnostics. Floor and node
              edits preserve existing edges. Disconnect does not auto-reconnect.
              Undo/redo applies to stair operations while no other editor has
              changed the event.
            </p>
            <p>
              Ctrl/Cmd+Z: undo. Ctrl/Cmd+Shift+Z: redo. L: toggle connections.
              F: fit highlighted stairs. Esc: cancel connection/clear highlight.
              ?: this guide. Input fields keep their normal keyboard behavior.
              Use JSON for complete stair metadata; XML/CSV retain legacy
              routing but omit floor order and node annotations.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
