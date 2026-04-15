import { RouteInfo } from "./route-analyzer";
import { Node, Edge } from "./models/graph";
import { edgeKey } from "./utils/graph-utils";
import { latLonToUtm, utmToLatLon, type UtmCoordinate } from "./geo-utils";
import type { Control } from "./models/control";
import type { Polygon } from "./models/polygon";
import { isLevelChangeEdge } from "./scoring-models";

const MM_TO_METERS = 0.001;

/**
 * Generates a GPX string for a given route or set of legs.
 * 
 * @param routes - One or more RouteInfo objects. If multiple, they are treated as consecutive legs.
 * @param nodes - Array of all graph nodes.
 * @param edges - Array of all graph edges.
 * @param scale - Map scale (e.g., 4000 for 1:4000).
 * @param speed - Speed in m/s for time calculation.
 * @param startTime - Start time for the track.
 * @param mapReference - Optional georeferencing info (top-left lat/lon).
 * @param controls - Controls for level change detection.
 * @param polygons - Polygons for level change detection.
 * @returns GPX XML string.
 */
export function generateGpx(
  routes: RouteInfo | RouteInfo[],
  nodes: Node[],
  edges: Edge[],
  scale: number,
  speed: number,
  startTime: Date,
  mapReference?: { latitude: number; longitude: number },
  controls: Control[] = [],
  polygons: Polygon[] = [],
): string {
  const routeList = Array.isArray(routes) ? routes : [routes];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, Edge>();
  
  // Prepare georeferencing
  let utmRef: UtmCoordinate | null = null;
  if (mapReference && mapReference.latitude !== undefined && mapReference.longitude !== undefined) {
      utmRef = latLonToUtm(mapReference.latitude, mapReference.longitude);
  }
  
  // Build edge map for quick lookup: "u -> v"
  edges.forEach(e => {
    edgeMap.set(`${e.from}|${e.to}`, e);
    // If edges are bidirectional or have a reverse counterpart, they might appear as separate entries
    // or we might need to check both directions if graph is undirected.
    // Based on Edge definition, it seems directed.
    // If undirected, we might need to handle that, but `path` is ordered.
  });

  // Cache for level change computation
  const levelChangeCache = new Map<string, boolean>();
  const checkLevelChange = (edge: Edge): boolean => {
    const key = edgeKey(edge);
    if (!levelChangeCache.has(key)) {
      levelChangeCache.set(key, isLevelChangeEdge(edge, nodes, controls, polygons));
    }
    return levelChangeCache.get(key)!;
  };

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Indoor O Route Analysis" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Exported Route</name>
`;

  let currentTime = startTime.getTime();
  let currentSegment = "";
  let segmentPoints = 0;

  const startNewSegment = () => {
    if (segmentPoints > 0) {
      gpx += `    <trkseg>\n${currentSegment}    </trkseg>\n`;
    }
    currentSegment = "";
    segmentPoints = 0;
  };

  // Helper to add a point
  const addPoint = (nodeId: string, time: number) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    // Convert map mm to real world meters
    // Assume 0,0 is reference.
    // X (Easting) -> long? Y (Northing) -> lat?
    // Using simple mapping: lon = x_m, lat = y_m
    // Note: y in graphics usually goes down. In math/geo, North goes up.
    // If we want a "map" view, we might keep it as is, or invert Y.
    // Given the prompt "multiplying with the scale", I'll just do the scaling.
    let latVal = 0;
    let lonVal = 0;

    if (utmRef) {
        // Georeferenced
        const dE = node.x * scale * MM_TO_METERS;
        const dN = -node.y * scale * MM_TO_METERS; // y down on screen -> y down (South) on map = negative delta North

        const currentUtmX = utmRef.x + dE;
        const currentUtmY = utmRef.y + dN;
        const currentLL = utmToLatLon(currentUtmX, currentUtmY, utmRef.zone, utmRef.isSouthern);
        latVal = currentLL.latitude;
        lonVal = currentLL.longitude;
    } else {
        // Simple relative meters
        const x_m = node.x * scale * MM_TO_METERS;
        const y_m = node.y * scale * MM_TO_METERS;
        // Map meters directly to lat/lon fields (not valid geo, but valid for local tools)
        latVal = y_m;
        lonVal = x_m;
    }

    const isoTime = new Date(time).toISOString();
    
    // We use 'lat' and 'lon' to store the meters coordinates.
    // This is technically invalid GPX (lat/lon must be degrees), but requested by user.
    currentSegment += `      <trkpt lat="${latVal.toFixed(6)}" lon="${lonVal.toFixed(6)}">
        <time>${isoTime}</time>
      </trkpt>\n`;
    segmentPoints++;
  };

  let previousNodeId: string | null = null;

  for (const route of routeList) {
    if (!route.path || route.path.length === 0) continue;

    const path = route.path;
    
    // If this is a subsequent leg, the first point is the same as the last point of previous leg.
    // We should avoid duplicating it if it's in the same segment.
    // However, if we forced a segment break between legs, we would duplicate.
    // Generally, legs are continuous.
    
    let startIndex = 0;
    
    // Check continuity with previous leg
    if (previousNodeId && path[0] === previousNodeId) {
      // We already added this point. Start from next.
      startIndex = 1;
    } else {
        // Discontinuity or first leg. 
        // If there was a previous node and we are starting a new unconnected path, 
        // we should probably start a new segment? 
        // Usually O-courses are continuous.
        if (previousNodeId) {
            // Force new segment if jump
             startNewSegment();
        }
    }

    for (let i = startIndex; i < path.length; i++) {
        const nodeId = path[i];
        
        if (i === 0 && !previousNodeId) {
            // Very first point of first leg
            addPoint(nodeId, currentTime);
            previousNodeId = nodeId;
            continue;
        }

        // We need to check edge from previousNodeId to nodeId
        if (previousNodeId) {
            const edgeKey = `${previousNodeId}|${nodeId}`;
            const edge = edgeMap.get(edgeKey);
            
            // Note: edge might not be found if path assumes connectivity that isn't in edge list (unlikely)
            // Or if edges are stored differently.
            
            // Calculate distance to advance time
            const prevNode = nodeMap.get(previousNodeId);
            const currNode = nodeMap.get(nodeId);
            
            let dist = 0;
            if (prevNode && currNode) {
                const dx = prevNode.x - currNode.x;
                const dy = prevNode.y - currNode.y;
                dist = Math.sqrt(dx * dx + dy * dy) * scale * MM_TO_METERS;
            }
            
            // Advance time
            // speed is m/s. dist is m.
            // time_delta (ms) = (dist / speed) * 1000
            const timeDeltaMs = (dist / speed) * 1000;
            currentTime += timeDeltaMs;

            if (edge) {
                if (checkLevelChange(edge) || edge.ignoreLength) {
                     // "do not include the level change edges"
                     // "start a new gpx segment for each of those"
                     // This means the movement happens, but we break the track.
                     // The point 'nodeId' (destination of level change) starts the NEW segment.
                     
                     startNewSegment();
                     
                     // Add the poin to the new segment
                     addPoint(nodeId, currentTime);
                } else {
                    addPoint(nodeId, currentTime);
                }
            } else {
                // Fallback if edge not found - assume normal connection
                addPoint(nodeId, currentTime);
            }
        }
        
        previousNodeId = nodeId;
    }
  }

  // Flush last segment
  startNewSegment();

  gpx += `  </trk>
</gpx>`;

  return gpx;
}
