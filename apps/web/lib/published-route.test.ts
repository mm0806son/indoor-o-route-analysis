import { expect, it } from 'vitest';
import { buildLeg, makeDraft } from './published-route';
import { RouteAnalyzer } from '@indoor-o-route-analysis/core';
const analyzer = new RouteAnalyzer(
  [],
  [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 10, y: 0 },
    { id: 'c', x: 20, y: 0 },
  ],
  [
    { from: 'a', to: 'b', label: '', oneWay: true },
    { from: 'b', to: 'c', label: '' },
  ],
  1000,
);
it('builds only legal directed paths through selected waypoints', () => {
  expect(buildLeg(analyzer, 'a', 'c', ['b']).path.map((n) => n.nodeId)).toEqual(
    ['a', 'b', 'c'],
  );
  expect(() => buildLeg(analyzer, 'c', 'a', [])).toThrow();
});
it('new routes retain empty legs so incomplete exports can be rejected', () => {
  const draft = makeDraft(
    {
      id: 'course',
      name: 'C',
      mapId: 'm',
      controls: [{ controlId: 'a' }, { controlId: 'c' }],
    },
    'id',
  );
  expect(draft.legs[0].path).toEqual([]);
});

it('offers bounded distinct alternatives without reversing a one-way edge', async () => {
  const { exploreLegs } = await import('./published-route');
  const choices = exploreLegs(analyzer, 'a', 'c');
  expect(choices).toHaveLength(1);
  expect(choices[0].path.map((n) => n.nodeId)).toEqual(['a', 'b', 'c']);
  expect(exploreLegs(analyzer, 'c', 'a')).toEqual([]);
});
