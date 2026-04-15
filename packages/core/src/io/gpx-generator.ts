import type { CustomRoute, EventData, Node } from "../models";

export class GpxGenerator {
  static generateGpx(route: CustomRoute, event: EventData): string {
    const name = route.name || "Route";
    const date = event.startTime?.date ? new Date(event.startTime.date).toISOString() : new Date().toISOString();
    
    // Get graph vertices for coordinate lookup
    const vertices = event.raceCourses?.[0]?.vertices || [];
    const vertexMap = new Map<string, Node>();
    vertices.forEach(v => vertexMap.set(v.id, v));

    // Get map scale for coordinate conversion (defaults to 1:4000 if not found)
    const mapData = event.raceCourses?.[0]?.maps?.[0];
    const scale = mapData?.scale || 4000;
    
    // Default origin (Stockholm) if no georeferencing is available
    // Future: Use real world coordinates from map metadata if available
    const originLat = 59.3293;
    const originLon = 18.0686;
    
    // Constants for coordinate conversion
    // 1 deg lat = 111132m
    // 1 deg lon = 111132m * cos(lat)
    const metersPerLat = 111132;
    const metersPerLon = 111132 * Math.cos(originLat * Math.PI / 180);

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Indoor O Route Analysis" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>${date}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
`;

    // Process all legs
    if (route.legs) {
      route.legs.forEach(leg => {
        if (leg.path) {
          leg.path.forEach((p) => {
             // Handle both old format (string) and new format (RouteLegNode)
             const nodeId = typeof p === 'string' ? p : p.nodeId;
             const node = vertexMap.get(nodeId);
             
             if (node) {
               // Convert map mm to real world meters
               // Axis orientation: In IOF XML, Y is usually North (Up).
               // If source is SVG screen coordinates, Y is Down.
               // Assuming IOF/Graph coordinates (Y Up):
               const xMeters = (node.x || 0) * scale / 1000;
               const yMeters = (node.y || 0) * scale / 1000;
               
               const dLat = yMeters / metersPerLat;
               const dLon = xMeters / metersPerLon;
               
               const lat = originLat + dLat;
               const lon = originLon + dLon;
               
               gpx += `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">
        <ele>0</ele>
      </trkpt>
`;
             }
          });
        }
      });
    }

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
  }
}
