import type { Node, StairNode } from "./models/graph";
import type { RaceCourseData } from "./models/event";
import { isPointInPolygon } from "./polygon-utils";

export function normalizeStairCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]+[0-9]*$/.test(normalized))
    throw new Error(
      "Use letters with an optional numeric suffix, e.g. A or A1.",
    );
  return normalized;
}
export function validateFloorOrder(order: number[]): void {
  if (
    !order.length ||
    order.some((n) => !Number.isFinite(n)) ||
    new Set(order).size !== order.length
  )
    throw new Error(
      "Configure a non-empty, unique floor order from lowest to highest.",
    );
}
export const hasStairPort = (stair: StairNode, port: "up" | "down") =>
  stair.port === port || stair.port === "both";
export function stairNodeLabel(stair: StairNode): string {
  const code = stair.code.toUpperCase();
  return stair.port === "both"
    ? `${code}/${code.toLowerCase()}`
    : stair.port === "up"
      ? code
      : code.toLowerCase();
}
export function inferStairFloor(
  node: Node,
  race: RaceCourseData,
): number | undefined {
  const levels = new Set(
    (race.polygons ?? [])
      .filter((p) => p.level !== undefined && isPointInPolygon(node, p.points))
      .map((p) => p.level!),
  );
  return levels.size === 1 ? [...levels][0] : undefined;
}
function orderedPair(
  race: RaceCourseData,
  a: Node,
  b: Node,
  allowSkip = false,
): [Node, Node] {
  const order = race.stairFloorOrder ?? [];
  validateFloorOrder(order);
  if (!a.stair || !b.stair || a.id === b.id)
    throw new Error("Select two different annotated stair nodes.");
  if (normalizeStairCode(a.stair.code) !== normalizeStairCode(b.stair.code))
    throw new Error("Stair codes do not match.");
  const ai = order.indexOf(a.stair.floor),
    bi = order.indexOf(b.stair.floor);
  if (ai < 0 || bi < 0 || ai === bi)
    throw new Error("Nodes must occupy different configured floors.");
  if (!allowSkip && Math.abs(ai - bi) !== 1)
    throw new Error(
      "Missing intermediate floor: explicit cross-floor confirmation required.",
    );
  const [lo, hi] = ai < bi ? [a, b] : [b, a];
  if (!hasStairPort(lo.stair!, "up") || !hasStairPort(hi.stair!, "down"))
    throw new Error(
      "The lower node needs an up port and the upper node a down port.",
    );
  return [lo, hi];
}
export function connectStairNodes(
  race: RaceCourseData,
  from: string,
  to: string,
  allowSkip = false,
): RaceCourseData {
  const a = race.vertices?.find((n) => n.id === from),
    b = race.vertices?.find((n) => n.id === to);
  if (!a || !b) throw new Error("Stair node no longer exists.");
  const [lo, hi] = orderedPair(race, a, b, allowSkip);
  const edges = race.edges ?? [];
  if (
    edges.some(
      (e) =>
        (e.from === from && e.to === to) || (e.from === to && e.to === from),
    )
  )
    throw new Error(
      "An edge already connects these nodes. Edit the existing edge in Graph Editor.",
    );
  const code = normalizeStairCode(lo.stair!.code);
  return {
    ...race,
    edges: [
      ...edges,
      {
        from: lo.id,
        to: hi.id,
        label: code,
        reverseLabel: code.toLowerCase(),
        ignoreLength: true,
        oneWay: false,
      },
    ],
  };
}
export function matchStairNodes(
  race: RaceCourseData,
  nodeId?: string,
): { race: RaceCourseData; messages: string[] } {
  validateFloorOrder(race.stairFloorOrder ?? []);
  const order = race.stairFloorOrder!;
  const nodes = race.vertices ?? [];
  let next = race;
  const messages: string[] = [];
  const codes = [
    ...new Set(
      nodes
        .filter((n) => n.stair)
        .map((n) => normalizeStairCode(n.stair!.code)),
    ),
  ];
  for (const code of codes)
    for (let i = 0; i < order.length - 1; i++) {
      const low = nodes.filter(
        (n) =>
          n.stair &&
          normalizeStairCode(n.stair.code) === code &&
          n.stair.floor === order[i] &&
          hasStairPort(n.stair, "up"),
      );
      const high = nodes.filter(
        (n) =>
          n.stair &&
          normalizeStairCode(n.stair.code) === code &&
          n.stair.floor === order[i + 1] &&
          hasStairPort(n.stair, "down"),
      );
      if (nodeId && ![...low, ...high].some((n) => n.id === nodeId)) continue;
      if (!low.length && !high.length) continue;
      if (low.length !== 1 || high.length !== 1) {
        messages.push(
          `${code} ${order[i]} ↔ ${order[i + 1]}: ${!low.length || !high.length ? "missing endpoint" : "ambiguous endpoints"}`,
        );
        continue;
      }
      try {
        next = connectStairNodes(next, low[0].id, high[0].id);
      } catch (e) {
        messages.push(`${code}: ${(e as Error).message}`);
      }
    }
  return { race: next, messages };
}
/** Adds metadata only. Never changes old edge orientation, labels or routing behavior. */
export function convertLegacyStairs(race: RaceCourseData): {
  race: RaceCourseData;
  messages: string[];
} {
  validateFloorOrder(race.stairFloorOrder ?? []);
  const vertices = (race.vertices ?? []).map((n) => ({ ...n }));
  const byId = new Map(vertices.map((n) => [n.id, n]));
  const proposals = new Map<string, StairNode[]>();
  const messages: string[] = [];
  for (const e of race.edges ?? []) {
    if (!e.ignoreLength) continue;
    try {
      if (e.oneWay) throw new Error("one-way edge preserved");
      const code = normalizeStairCode(e.label);
      if (
        e.reverseLabel !== (e.label === code ? code.toLowerCase() : code) ||
        ![code, code.toLowerCase()].includes(e.label)
      )
        throw new Error("labels are not complementary upper/lower codes");
      const from = byId.get(e.from),
        to = byId.get(e.to);
      if (!from || !to) throw new Error("endpoint is not a graph node");
      const ff = from.stair?.floor ?? inferStairFloor(from, race),
        tf = to.stair?.floor ?? inferStairFloor(to, race);
      if (ff === undefined || tf === undefined)
        throw new Error("floor unknown or overlapping");
      const fs: StairNode = {
        code,
        floor: ff,
        port: e.label === code ? "up" : "down",
      };
      const ts: StairNode = {
        code,
        floor: tf,
        port: fs.port === "up" ? "down" : "up",
      };
      orderedPair(race, { ...from, stair: fs }, { ...to, stair: ts });
      for (const [n, s] of [
        [from, fs],
        [to, ts],
      ] as const)
        proposals.set(n.id, [...(proposals.get(n.id) ?? []), s]);
    } catch (err) {
      messages.push(`${e.from} ↔ ${e.to}: ${(err as Error).message}`);
    }
  }
  for (const n of vertices) {
    const list = proposals.get(n.id);
    if (!list) continue;
    if (n.stair) list.push(n.stair);
    if (
      new Set(list.map((s) => `${s.code.toUpperCase()}:${s.floor}`)).size !== 1
    ) {
      messages.push(
        `${n.id}: conflicting stair identities; metadata preserved`,
      );
      continue;
    }
    n.stair = {
      ...list[0],
      port: new Set(list.map((s) => s.port)).size > 1 ? "both" : list[0].port,
    };
  }
  return { race: { ...race, vertices }, messages };
}
export function diagnoseStairs(race: RaceCourseData): string[] {
  const messages: string[] = [];
  const nodes = race.vertices ?? [];
  const order = race.stairFloorOrder ?? [];
  try {
    validateFloorOrder(order);
  } catch (e) {
    return [(e as Error).message];
  }
  for (const n of nodes)
    if (n.stair) {
      if (!order.includes(n.stair.floor))
        messages.push(`${n.id}: floor ${n.stair.floor} is not configured`);
      const inferred = inferStairFloor(n, race);
      if (inferred !== undefined && inferred !== n.stair.floor)
        messages.push(
          `${n.id}: annotation floor ${n.stair.floor} differs from polygon ${inferred}`,
        );
      for (const port of ["up", "down"] as const)
        if (hasStairPort(n.stair, port)) {
          const floor =
            order[order.indexOf(n.stair.floor) + (port === "up" ? 1 : -1)];
          const candidates = nodes.filter(
            (b) =>
              b.stair &&
              b.stair.code.toUpperCase() === n.stair!.code.toUpperCase() &&
              b.stair.floor === floor &&
              hasStairPort(b.stair, port === "up" ? "down" : "up"),
          );
          const connected = candidates.filter((b) =>
            race.edges?.some(
              (e) =>
                (e.from === n.id && e.to === b.id) ||
                (e.to === n.id && e.from === b.id),
            ),
          );
          if (!connected.length)
            messages.push(
              `${n.id} ${stairNodeLabel(n.stair)} ${port}: ${candidates.length > 1 ? "ambiguous targets" : candidates.length ? "disconnected" : "missing target"}`,
            );
        }
    }
  for (const e of race.edges ?? []) {
    const a = nodes.find((n) => n.id === e.from),
      b = nodes.find((n) => n.id === e.to);
    if (
      (!a?.stair && !b?.stair) ||
      (!e.ignoreLength &&
        (!a?.stair || !b?.stair || a.stair.floor === b.stair.floor))
    )
      continue;
    try {
      if (!a?.stair || !b?.stair) throw new Error("unannotated endpoint");
      if (!e.ignoreLength)
        throw new Error(
          "cross-floor edge must ignore length; existing ordinary edge preserved",
        );
      const [lo] = orderedPair(race, a, b);
      const code = normalizeStairCode(lo.stair!.code);
      const expected = e.from === lo.id ? code : code.toLowerCase();
      if (
        e.oneWay ||
        e.label !== expected ||
        e.reverseLabel !== (expected === code ? code.toLowerCase() : code)
      )
        throw new Error("edge labels/direction conflict with node annotations");
    } catch (err) {
      messages.push(`${e.from} ↔ ${e.to}: ${(err as Error).message}`);
    }
  }
  return messages;
}
