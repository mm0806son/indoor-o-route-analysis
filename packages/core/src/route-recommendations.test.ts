import { describe, expect, it, vi } from 'vitest';
import { RouteAnalyzer, type RouteInfo } from './route-analyzer';
import { compareCosts, findObjectivePath, selectRouteRecommendations, similarRouteGeometry, type RecommendationMetrics } from './route-recommendations';
import { analyzeCourseLegs, analyzeCourseLegsGenerator } from './course-analysis';
import type { EventData, Course } from './models';

const route = (id: string, distance: number) => ({ path: [id], distance } as RouteInfo);
const metrics = (navigationCost: number, floors: number): RecommendationMetrics => ({ navigationCost, floors, ascent: floors, descent: 0, transitions: floors });
const line = (y: number) => [{ x: 0, y, level: 0 }, { x: 100, y, level: 0 }];

describe('route recommendations', () => {
  it('retains three distinct objectives in priority order even for k=1', () => {
    const a = route('simple', 300), b = route('floors', 200), c = route('shortest', 100);
    const values = new Map([[a, metrics(2, 2)], [b, metrics(5, 0)], [c, metrics(8, 4)]]);
    const result = selectRouteRecommendations([c,b,a], r => values.get(r)!, r => line(r.distance), 1);
    expect(result.map(r => r.path[0])).toEqual(['simple', 'floors', 'shortest']);
    expect(result.map(r => r.recommendation!.reasons)).toEqual([['simple'], ['fewest floors'], ['shortest']]);
  });

  it('assigns multiple reasons once and does not mutate the input', () => {
    const a = route('a', 100);
    const result = selectRouteRecommendations([a,a], () => metrics(0,0), () => line(0));
    expect(result).toHaveLength(1);
    expect(result[0].recommendation!.reasons).toHaveLength(3);
    expect(a.recommendation).toBeUndefined();
  });

  it('keeps group optimum claims separate from the representative', () => {
    // Equal objective costs imply the shortest wins the tie. Use different floor costs
    // to confirm a meaningful optimum difference is never hidden by geometry.
    const a = route('a', 100), b = route('b', 102), c = route('c', 99);
    const result = selectRouteRecommendations([b,c,a], r => metrics(r === c ? 2 : 1, 1), () => line(0));
    expect(result).toHaveLength(2);
    expect(result[0].distance).toBe(100);
    expect(result[0].recommendation!.variants).toEqual([b]);
    expect(result[0].recommendation!.reasons).not.toContain('shortest');
    expect(result[1].recommendation!.reasons).toContain('shortest');
  });

  it('is geometric, subdivision invariant, and distinguishes corridors and floor strategies', () => {
    const a = line(0);
    expect(similarRouteGeometry(a, [a[0], { x: 30, y: 0, level: 0 }, a[1]])).toBe(true);
    expect(similarRouteGeometry(a, line(3))).toBe(true);
    expect(similarRouteGeometry(a, line(20))).toBe(false);
    expect(similarRouteGeometry(a, [{ ...a[0], level: 1 }, a[1]])).toBe(false);
    expect(similarRouteGeometry(a, [a[0], { x: 50, y: 20, level: 0 }, a[1]])).toBe(false);
  });

  it('does not merge substantially different costs even in the same corridor', () => {
    expect(selectRouteRecommendations([route('a',100), route('b',120)], r => metrics(r.distance === 100 ? 2 : 1,1), () => line(0))).toHaveLength(2);
  });

  it('fills k with distinct alternatives even when one route wins every objective', () => {
    const candidates = Array.from({ length: 9 }, (_, i) => route(`r${i}`, 100 + i * 10));
    const nearby = route('nearby', 102);
    const getMetrics = (r: RouteInfo) => metrics(r === nearby ? 0 : candidates.indexOf(r), 0);
    const getGeometry = (r: RouteInfo) => line(r === nearby ? 1 : candidates.indexOf(r) * 20);
    const choose = (k: number) => selectRouteRecommendations([...candidates, nearby], getMetrics, getGeometry, k);
    const six = choose(6), eight = choose(8);
    expect(six).toHaveLength(6);
    expect(eight).toHaveLength(8);
    expect(eight.slice(0, 6).map(r => r.path)).toEqual(six.map(r => r.path));
    expect(six[0].recommendation!.reasons).toHaveLength(3);
    expect(six[0].recommendation!.variants).toEqual([nearby]);
    expect(six.slice(1).every(r => r.recommendation!.reasons.length === 0)).toBe(true);
    expect(choose(4)).toHaveLength(4);
    expect(choose(20)).toHaveLength(9);
  });

  it('prioritizes tradeoffs before filling extra slots with dominated alternatives', () => {
    const candidates = [route('simple',300), route('floors',200), route('shortest',100), route('extra',400), route('tradeoff',150)];
    const values = [metrics(2,2), metrics(5,0), metrics(8,4), metrics(9,5), metrics(7,3)];
    const choose = (k: number) => selectRouteRecommendations(candidates,
      r => values[candidates.indexOf(r)], r => line(candidates.indexOf(r) * 20), k);
    expect(choose(4).map(r => r.path[0])).toEqual(['simple','floors','shortest','tradeoff']);
    expect(choose(5).map(r => r.path[0])).toEqual(['simple','floors','shortest','tradeoff','extra']);
  });

  it('does not pad k with near-identical routes when all candidates belong to one group', () => {
    const candidates = [route('a',100), route('b',101), route('c',102)];
    const result = selectRouteRecommendations(candidates, () => metrics(0,0), () => line(0), 8);
    expect(result).toHaveLength(1);
    expect(result[0].recommendation!.variants).toHaveLength(2);
  });

  it('uses exact lexicographic costs and respects directed disconnection', () => {
    const graph = new Map([
      ['s', new Map([['a', [0, 1000000, 0]], ['t', [1, 0, 0]]])],
      ['a', new Map([['t', [0, 1, 0]]])], ['t', new Map<string, number[]>()],
    ]);
    expect(findObjectivePath('s','t',graph)).toEqual(['s','a','t']);
    expect(findObjectivePath('t','s',graph)).toBeUndefined();
    expect(compareCosts([0, 1000001, 0], [1,0,0])).toBeLessThan(0);
  });
});

// A short route climbs two floors and descends again; the long same-floor
// corridor must survive even if the distance-penalty search never discovers it.
function fixture() {
  const controls = [{ id: 's', type: 'start' as const, mapPosition: { x: 0, y: 0 } }, { id: 't', type: 'finish' as const, mapPosition: { x: 100, y: 0 } }];
  const nodes = [{ id: 'up', x: 50, y: 0 }, { id: 'a', x: 0, y: 100 }, { id: 'b', x: 100, y: 100 }];
  const edges = [
    { from: 's', to: 'up', label: 'up', ignoreLength: true, oneWay: true },
    { from: 'up', to: 't', label: 'down', ignoreLength: true, oneWay: true },
    { from: 's', to: 'a', label: '', oneWay: true }, { from: 'a', to: 'b', label: '', oneWay: true }, { from: 'b', to: 't', label: '', oneWay: true },
  ];
  const polygons = [{ id: 'upper', level: 2, points: [{ x: 49, y: -1 }, { x: 51, y: -1 }, { x: 51, y: 1 }, { x: 49, y: 1 }] }];
  return { controls, nodes, edges, polygons, analyzer: new RouteAnalyzer(controls, nodes, edges, 1000, undefined, polygons) };
}

describe('recommendation integration', () => {
  it('supplements a distance-only pool, counts multi-floor edges both ways, and preserves legal paths', () => {
    const { analyzer, edges } = fixture();
    const shortest = analyzer.findAlternativePathsBetweenControls('s','t')[0];
    vi.spyOn(analyzer, 'findAlternativePathsBetweenControls').mockReturnValue([shortest]);
    const result = analyzer.findRecommendedPathsBetweenControls('s','t');
    expect(result[0].path).toContain('a');
    expect(result[0].recommendation!.metrics.floors).toBe(0);
    const short = result.find(r => r.recommendation!.reasons.includes('shortest'))!;
    expect(short.distance).toBe(0);
    expect(short.recommendation!.metrics).toMatchObject({ floors: 4, ascent: 2, descent: 2, transitions: 2 });
    for (const r of result) for (let i = 1; i < r.path.length; i++) {
      if (r.path[i-1] !== r.path[i]) expect(edges.some(e => e.from === r.path[i-1] && e.to === r.path[i])).toBe(true);
    }
  });

  it('counts a two-floor edge and two consecutive one-floor edges consistently', () => {
    const { controls, nodes, edges, polygons, analyzer } = fixture();
    const splitNodes = [...nodes, { id: 'mid', x: 25, y: 0 }];
    const splitEdges = edges.filter(e => !(e.from === 's' && e.to === 'up'));
    splitEdges.push({ from: 's', to: 'mid', label: 'up1', ignoreLength: true, oneWay: true }, { from: 'mid', to: 'up', label: 'up2', ignoreLength: true, oneWay: true });
    const splitPolygons = [...polygons, { id: 'middle', level: 1, points: [{ x: 24, y: -1 }, { x: 26, y: -1 }, { x: 26, y: 1 }, { x: 24, y: 1 }] }];
    const split = new RouteAnalyzer(controls, splitNodes, splitEdges, 1000, undefined, splitPolygons);
    const shortest = (a: RouteAnalyzer) => a.findRecommendedPathsBetweenControls('s','t').find(r => r.recommendation!.reasons.includes('shortest'))!.recommendation!.metrics;
    expect(shortest(split).floors).toBe(shortest(analyzer).floors);
    expect(shortest(split).navigationCost).toBe(shortest(analyzer).navigationCost);
    expect(shortest(split).transitions).toBe(3);
  });

  it('keeps sync and async course selection identical and leg statistics distance-based', async () => {
    const { analyzer, controls, nodes, edges, polygons } = fixture();
    const course = { id: 'course', controls: [{ controlId: 's' }, { controlId: 't' }] } as Course;
    const event = { raceCourses: [{ controls, vertices: nodes, edges, polygons }] } as EventData;
    const sync = analyzeCourseLegs(course, event, analyzer);
    let result;
    for await (const update of analyzeCourseLegsGenerator(course,event,analyzer)) result = update;
    expect(result!.routes).toEqual(sync.routes);
    expect(sync.routes[0][0].distance).toBe(300);
    expect(sync.legs[0].shortestDistance).toBe(0);
    expect(sync.legs[0].totalClimb).toEqual(result!.legs[0].totalClimb);
  });

  it('is stable under reversed node and edge input order', () => {
    const { analyzer, controls, nodes, edges, polygons } = fixture();
    const reversed = new RouteAnalyzer([...controls].reverse(), [...nodes].reverse(), [...edges].reverse(), 1000, undefined, polygons);
    expect(reversed.findRecommendedPathsBetweenControls('s','t').map(r => r.path)).toEqual(analyzer.findRecommendedPathsBetweenControls('s','t').map(r => r.path));
    expect(analyzer.findRecommendedPathsBetweenControls('t','s')).toEqual([]);
  });
});

describe('Wangfujing regression', () => {
  it('retains the simple floor strategy and shortest route near controls 38→57', async () => {
    const { readFileSync } = await import('node:fs');
    const race = JSON.parse(readFileSync('src/__fixtures__/wangfujing-stairs.json', 'utf8'));
    // The graph-only fixture omits transformed control positions. Use its actual
    // vertices adjacent to controls 38 and 57, without inventing map transforms.
    const controls = ['1482', '1541'].map(id => ({ id, type: 'control' as const, mapPosition: race.vertices.find((n: { id: string }) => n.id === id) }));
    const analyzer = new RouteAnalyzer(controls, race.vertices, race.edges, 1000, undefined, race.polygons);
    const before = performance.now();
    const routes = analyzer.findRecommendedPathsBetweenControls('1482', '1541');
    const elapsed = performance.now() - before;
    console.log('Wangfujing adjacent graph vertices recommendations', { elapsedMs: Math.round(elapsed), routes: routes.map(r => ({ label: r.description, distance: r.distance, ...r.recommendation!.metrics, reasons: r.recommendation!.reasons })) });
    expect(routes).toHaveLength(6);
    expect(routes.flatMap(r => [r, ...r.recommendation!.variants]).some(r => /^D2R[fg]$/.test(r.labels.join('')))).toBe(true);
    expect(routes.some(r => r.recommendation!.reasons.includes('shortest'))).toBe(true);
    expect(routes[0].recommendation!.metrics.floors).toBeLessThanOrEqual(3);
  });
});
