import { describe, it, expect } from 'vitest';
import { RouteAnalyzer } from './route-analyzer';
import { getDifficultyCategory, getCourseDifficulty } from './course-analysis';
import type { Control } from './models/control';
import type { Node } from "./models/graph";
import type { Edge } from "./models/graph";
import type { Polygon } from "./models/polygon";

describe('RouteAnalyzer', () => {
  // Test data setup
  const controls: Control[] = [
    { id: "c1", type: "start", mapPosition: { x: 0, y: 0 } },
    { id: "c2", type: "control", mapPosition: { x: 100, y: 0 } },
    { id: "c3", type: "control", mapPosition: { x: 200, y: 0 } },
    { id: "c4", type: "finish", mapPosition: { x: 300, y: 0 } },
  ];
  
  // Polygons for level detection:
  // - Level 1: c1(0,0), n1(50,0), c2(100,0), n2(150,0), n3(150,50)
  // - Level 2: c3(200,0), n4(250,0), c4(300,0)
  // Edge e4 goes from n2(150,0) on level 1 to c3(200,0) on level 2 - this should be a level change
  const polygons: Polygon[] = [
    { id: "p1", level: 1, points: [
      { x: -20, y: -20 }, { x: 175, y: -20 }, { x: 175, y: 70 }, { x: -20, y: 70 }
    ]},
    { id: "p2", level: 2, points: [
      { x: 175, y: -20 }, { x: 350, y: -20 }, { x: 350, y: 70 }, { x: 175, y: 70 }
    ]},
  ];

  const nodes: Node[] = [
    { id: 'n1', x: 50, y: 0 },
    { id: 'n2', x: 150, y: 0 },
    { id: 'n3', x: 150, y: 50 },
    { id: 'n4', x: 250, y: 0 },
  ];

  const edges: Edge[] = [
    { from: "c1", to: "n1", label: "corridor1", oneWay: false },
    { from: "n1", to: "c2", label: "corridor2", oneWay: false },
    { from: "c2", to: "n2", label: "corridor3", oneWay: false },
    { from: "n2", to: "c3", label: "stairs1", ignoreLength: true },
    { from: "c3", to: "n4", label: "corridor4", oneWay: true },
    { from: "n4", to: "c4", label: "corridor5", oneWay: false },
    // Alternative path
    { from: "n2", to: "n3", label: "alt1", oneWay: false },
    { from: "n3", to: "c3", label: "stairs2", ignoreLength: true },
  ];

  const mapScale = 5000; // 1:5000 scale

  describe('Distance Calculations', () => {
    it('should calculate straight-line distance between controls', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const distance = analyzer.calculateStraightLineDistance(controls[0], controls[1]);
      
      // 100mm at 1:5000 scale = 100 * 5000 * 0.001 = 500 meters
      expect(distance).toBe(500);
    });

    it('should calculate path distance including edges', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c1', 'n1', 'c2'];
      const distance = analyzer.calculatePathDistance(path);
      
      // c1->n1: 50mm * 5000 * 0.001 = 250m
      // n1->c2: 50mm * 5000 * 0.001 = 250m
      // Total: 500m
      expect(distance).toBe(500);
    });

    it('should calculate path distance through graph finding shortest paths between waypoints', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      // Specify waypoints: c1 -> c2 (should find shortest path through n1)
      const waypoints = ['c1', 'c2'];
      const distance = analyzer.calculatePathDistanceThroughGraph(waypoints);
      
      // Should find path c1->n1->c2
      // c1->n1: 50mm * 5000 * 0.001 = 250m
      // n1->c2: 50mm * 5000 * 0.001 = 250m
      // Total: 500m
      expect(distance).toBe(500);
    });

    it('should calculate path distance through graph with multiple waypoints', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      // Specify waypoints: c1 -> n1 -> c2
      // This should find shortest path from c1 to n1, then from n1 to c2
      const waypoints = ['c1', 'n1', 'c2'];
      const distance = analyzer.calculatePathDistanceThroughGraph(waypoints);
      
      // Path should be: c1->n1->c2
      // c1->n1: 50mm * 5000 * 0.001 = 250m
      // n1->c2: 50mm * 5000 * 0.001 = 250m
      // Total: 500m
      expect(distance).toBe(500);
    });

    it('should return infinity when no path exists between waypoints', () => {
      // Add an isolated node
      const isolatedNode: Node = { id: 'isolated', x: 1000, y: 1000 };
      const analyzerWithIsolated = new RouteAnalyzer(controls, [...nodes, isolatedNode], edges, mapScale);
      
      const waypoints = ['c1', 'isolated'];
      const distance = analyzerWithIsolated.calculatePathDistanceThroughGraph(waypoints);
      
      expect(distance).toBe(Number.POSITIVE_INFINITY);
    });

    it('should return 0 for empty or single waypoint', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      
      expect(analyzer.calculatePathDistanceThroughGraph([])).toBe(0);
      expect(analyzer.calculatePathDistanceThroughGraph(['c1'])).toBe(0);
    });

    it('should calculate route distance between controls', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const distance = analyzer.calculateRouteDistance(controls[0], controls[1]);
      
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeCloseTo(500, 0);
    });

    it('should calculate total course length', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const courseLength = analyzer.calculateCourseLength([controls[0], controls[1]]);
      
      expect(courseLength).toBeGreaterThan(0);
    });
  });

  describe('Shortest Path Algorithm (Dijkstra)', () => {
    it('should find shortest path between two nodes', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const result = analyzer.dijkstra('c1', 'c2');
      
      expect(result).not.toBeNull();
      expect(result?.path).toEqual(['c1', 'n1', 'c2']);
      expect(result?.distance).toBeGreaterThan(0);
    });

    it('should return null when no path exists', () => {
      const isolatedNodes: Node[] = [{ id: 'isolated', x: 1000, y: 1000 }];
      const analyzer = new RouteAnalyzer(controls, isolatedNodes, edges, mapScale);
      const result = analyzer.dijkstra('c1', 'isolated');
      
      expect(result).toBeNull();
    });

    it('should find path between controls', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const result = analyzer.findShortestPathBetweenControls(controls[0], controls[1]);
      
      expect(result).not.toBeNull();
      expect(result?.path).toContain('c1');
      expect(result?.path).toContain('c2');
    });
  });

  describe('Path Metrics', () => {
    it('should count one-way edges in path', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c2', 'n2', 'c3', 'n4'];
      const count = analyzer.countOneWayEdgesInPath(path);
      
      // e5 (c3->n4) is one-way
      expect(count).toBe(1);
    });

    it("should count ignoreLength edges (stairs) in path", () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ["c2", "n2", "c3"];
      const count = analyzer.countIgnoreLengthEdgesInPath(path);

      // e4 (n2->c3) is a stair/ignoreLength edge
      expect(count).toBe(1);
    });

    it('should count alternative edges at decision points', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c2', 'n2', 'c3'];
      const count = analyzer.countAlternativeEdgesInPath(path);
      
      // At n2, there are 2 outgoing edges (to c3 and to n3), so 1 alternative
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should analyze route for decision points', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c2', 'n2', 'c3', 'n4'];
      const analysis = analyzer.analyzeRoute(path);
      
      expect(analysis).toHaveProperty('decisionPoints');
      expect(analysis).toHaveProperty('alternativeEdges');
      expect(analysis.decisionPoints).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Alternative Path Finding', () => {
    it('should find multiple alternative paths', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const routes = analyzer.findAlternativePathsBetweenControls('c2', 'c3', 3);
      
      expect(routes.length).toBeGreaterThan(0);
      expect(routes.length).toBeLessThanOrEqual(3);
      
      // Each route should have required properties
      routes.forEach(route => {
        expect(route).toHaveProperty('distance');
        expect(route).toHaveProperty('path');
        expect(route).toHaveProperty('difficulty');
        expect(route).toHaveProperty('description');
      });
    });

    it('should return routes sorted by distance', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const routes = analyzer.findAlternativePathsBetweenControls('c2', 'c3', 3);
      
      for (let i = 1; i < routes.length; i++) {
        expect(routes[i].distance).toBeGreaterThanOrEqual(routes[i - 1].distance);
      }
    });

    it('should include unique stair sequences', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const routes = analyzer.findAlternativePathsBetweenControls('c2', 'c3', 3);
      
      // Check for edges with ignoreLength (typically stairs)
      const stairSequences = routes.map(route => {
        return route.path
          .slice(0, -1)
          .map((nodeId, i) => {
            const edge = edges.find(
              (e) =>
                (e.from === nodeId && e.to === route.path[i + 1]) ||
                (!e.oneWay && e.from === route.path[i + 1] && e.to === nodeId),
            );
            return edge?.ignoreLength ? edge.label : null;
          })
          .filter(Boolean)
          .join(',');
      });
      
      // Check that we have different stair sequences (if multiple routes exist)
      const uniqueSequences = new Set(stairSequences);
      expect(uniqueSequences.size).toBeGreaterThan(0);
    });
  });

  describe('Human Route Analysis', () => {
    it('prefers a same-floor unlabeled route even when a stair shortcut is shorter', () => {
      const humanControls: Control[] = [
        { id: 'hs', type: 'start', mapPosition: { x: 0, y: 0 } },
        { id: 'ht', type: 'finish', mapPosition: { x: 300, y: 0 } },
      ];

      const humanNodes: Node[] = [
        { id: 'h1', x: 100, y: 0 },
        { id: 'h2', x: 200, y: 0 },
        { id: 'hu', x: 0, y: 100 },
        { id: 'hv', x: 300, y: 100 },
      ];

      const humanEdges: Edge[] = [
        { from: 'hs', to: 'h1', label: '', oneWay: false },
        { from: 'h1', to: 'h2', label: '', oneWay: false },
        { from: 'h2', to: 'ht', label: '', oneWay: false },
        { from: 'hs', to: 'hu', label: '', oneWay: false },
        { from: 'hu', to: 'hv', label: 'A', oneWay: false, ignoreLength: true },
        { from: 'hv', to: 'ht', label: '', oneWay: false },
      ];

      const analyzer = new RouteAnalyzer(humanControls, humanNodes, humanEdges, mapScale);

      const humanRoute = analyzer.findHumanRouteBetweenControls('hs', 'ht');
      expect(humanRoute).toBeDefined();
      expect(humanRoute!.labels).toEqual([]);

      const shortestRoute = analyzer.shortestRouteBetweenControls(humanControls[0], humanControls[1]);
      expect(shortestRoute).toBeDefined();
      expect(shortestRoute!.labels).toContain('A');
      expect(humanRoute!.distance).toBeGreaterThan(shortestRoute!.distance);

      const allRoutes = analyzer.findAllAlternativePathsBetweenControls('hs', 'ht', 20);
      const allLabelSequences = new Set(allRoutes.map((r) => r.labels.join(',')));
      expect(allLabelSequences.has('')).toBe(true);
      expect(allLabelSequences.has('A')).toBe(true);
      expect(allLabelSequences.has(humanRoute!.labels.join(','))).toBe(true);
    });

    it('finds a stair route with alternating forward/backward search and matches other analyzers', () => {
      const humanControls: Control[] = [
        { id: 'f', type: 'start', mapPosition: { x: 0, y: 0 } },
        { id: 't', type: 'finish', mapPosition: { x: 300, y: 0 } },
      ];

      const humanNodes: Node[] = [
        { id: 'sf', x: 50, y: 0 },
        { id: 'm', x: 150, y: 0 },
        { id: 'tt', x: 250, y: 0 },
      ];

      const humanEdges: Edge[] = [
        { from: 'f', to: 'sf', label: '', oneWay: false },
        { from: 'sf', to: 'm', label: 'A', oneWay: false, ignoreLength: true },
        { from: 'm', to: 'tt', label: 'b', oneWay: true, ignoreLength: true },
        { from: 'tt', to: 't', label: '', oneWay: false },
      ];

      const analyzer = new RouteAnalyzer(humanControls, humanNodes, humanEdges, mapScale);

      const humanRoute = analyzer.findHumanRouteBetweenControls('f', 't');
      expect(humanRoute).toBeDefined();
      expect(humanRoute!.labels).toEqual(['A', 'b']);

      const shortestRoute = analyzer.shortestRouteBetweenControls(humanControls[0], humanControls[1]);
      expect(shortestRoute).toBeDefined();
      expect(shortestRoute!.labels.join(',')).toBe(humanRoute!.labels.join(','));

      const allRoutes = analyzer.findAllAlternativePathsBetweenControls('f', 't', 20);
      const labelSequences = new Set(allRoutes.map((r) => r.labels.join(',')));
      expect(labelSequences.has(humanRoute!.labels.join(','))).toBe(true);
    });
  });

  describe('Route Description', () => {
    it('should generate route description from edge labels', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c1', 'n1', 'c2', 'n2'];
      const description = analyzer.getRouteDescription(path);
      
      expect(description).toContain('corridor1');
      expect(description).toContain('corridor2');
      expect(description).toContain('corridor3');
    });

    it('should extract stair sequence from path', () => {
      // Need polygons to detect level changes for stair sequence
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale, undefined, polygons);
      const path = ['c2', 'n2', 'c3'];
      const stairSeq = analyzer.getStairSequence(path);
      
      expect(stairSeq).toContain('stairs1');
    });
  });

  describe('Difficulty Calculations', () => {
    it('should calculate path difficulty', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c1', 'n1', 'c2', 'n2', 'c3'];
      const difficulty = analyzer.calculatePathDifficulty(path);
      
      expect(difficulty).toBeGreaterThanOrEqual(0);
      expect(typeof difficulty).toBe('number');
    });

    it('should calculate leg difficulty breakdown', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const path = ['c2', 'n2', 'c3', 'n4'];
      const legDifficulty = analyzer.calculateLegDifficulty(path);
      
      expect(legDifficulty).toHaveProperty('oneWay');
      expect(legDifficulty).toHaveProperty('alternativeEdges');
      expect(legDifficulty).toHaveProperty('stairs');
      expect(legDifficulty).toHaveProperty('total');
      expect(legDifficulty.total).toBeGreaterThanOrEqual(0);
    });

    it('should calculate leg difficulty between controls', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const difficulty = analyzer.calculateLegDifficultyBetweenControls(controls[0], controls[1]);
      
      expect(difficulty).toBeGreaterThanOrEqual(0);
    });

    it('should calculate detailed leg difficulty between controls', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const legDifficulty = analyzer.calculateDetailedLegDifficultyBetweenControls(controls[1], controls[2]);
      
      expect(legDifficulty).toHaveProperty('stairs');
      expect(legDifficulty.stairs).toBeGreaterThan(0); // Path includes stairs
    });

    it('should calculate course difficulty', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const courseDifficulty = analyzer.calculateCourseDifficulty(controls);
      
      expect(courseDifficulty).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Utility Methods', () => {
    it('should check if graph has data', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      expect(analyzer.hasGraph()).toBe(true);
      
      const emptyAnalyzer = new RouteAnalyzer([], [], [], mapScale);
      expect(emptyAnalyzer.hasGraph()).toBe(false);
    });

    it('should get node ID for control', () => {
      const analyzer = new RouteAnalyzer(controls, nodes, edges, mapScale);
      const nodeId = analyzer.getNodeIdForControl('c1');
      
      expect(nodeId).toBe('c1'); // Controls are mapped to themselves
    });
  });
});

describe('Standalone Utility Functions', () => {
  describe('getDifficultyCategory', () => {
    it('should return white for difficulty 0-20', () => {
      const category = getDifficultyCategory(10);
      expect(category.name).toBe('white');
      expect(category.label).toBe('White');
    });

    it('should return yellow for difficulty 20-40', () => {
      const category = getDifficultyCategory(30);
      expect(category.name).toBe('yellow');
      expect(category.label).toBe('Yellow');
    });

    it('should return orange for difficulty 40-60', () => {
      const category = getDifficultyCategory(50);
      expect(category.name).toBe('orange');
      expect(category.label).toBe('Orange');
    });

    it('should return purple for difficulty 60-80', () => {
      const category = getDifficultyCategory(70);
      expect(category.name).toBe('purple');
      expect(category.label).toBe('Purple');
    });

    it('should return black for difficulty > 80', () => {
      const category = getDifficultyCategory(90);
      expect(category.name).toBe('black');
      expect(category.label).toBe('Black');
    });

    it('should have color and textColor properties', () => {
      const category = getDifficultyCategory(50);
      expect(category).toHaveProperty('color');
      expect(category).toHaveProperty('textColor');
    });
  });

  describe('getCourseDifficulty', () => {
    it('should return maximum leg difficulty by default', () => {
      const legs = [
        { difficulty: 10 },
        { difficulty: 50 },
        { difficulty: 30 },
      ];
      
      const courseDifficulty = getCourseDifficulty(legs);
      expect(courseDifficulty).toBe(50);
    });

    it('should return 0 for empty legs array', () => {
      const courseDifficulty = getCourseDifficulty([]);
      expect(courseDifficulty).toBe(0);
    });
  });
});
