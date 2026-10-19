import { describe, expect, it } from 'vitest';
import {
  draftKey,
  readDrafts,
  writeDrafts,
  parseBackup,
} from './published-storage';
const scope = { eventId: 'race', revision: '1', courseId: 'short' };
const route = { id: 'r', name: 'My route', courseId: 'short', legs: [] };
describe('published personal drafts', () => {
  it('isolates event, revision and course without separator collisions', () => {
    expect(
      new Set([
        draftKey(scope),
        draftKey({ ...scope, revision: '2' }),
        draftKey({ ...scope, eventId: 'other' }),
        draftKey({ ...scope, courseId: 'long' }),
      ]).size,
    ).toBe(4);
  });
  it('round trips partial routes and preserves another revision', () => {
    localStorage.clear();
    writeDrafts(localStorage, scope, [route]);
    expect(readDrafts(localStorage, scope)).toEqual([route]);
    expect(readDrafts(localStorage, { ...scope, revision: '2' })).toEqual([]);
    expect(readDrafts(localStorage, scope)).toEqual([route]);
  });
  it('reports failed writes and corrupt data instead of discarding drafts', () => {
    expect(() =>
      writeDrafts(
        {
          setItem() {
            throw Error('quota');
          },
        },
        scope,
        [route],
      ),
    ).toThrow('quota');
    localStorage.setItem(draftKey(scope), '{');
    expect(() => readDrafts(localStorage, scope)).toThrow();
  });
  it('rejects backup scope mismatch and malformed node references', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({ schemaVersion: 1, ...scope, routes: [route] }),
        { ...scope, revision: '2' },
        new Set(),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify({
          schemaVersion: 1,
          ...scope,
          routes: [
            {
              ...route,
              legs: [
                {
                  fromControlId: 's',
                  toControlId: 'f',
                  path: [{ nodeId: 'missing' }],
                },
              ],
            },
          ],
        }),
        scope,
        new Set(['s', 'f']),
      ),
    ).toThrow();
  });
});

it('detects retained old revision drafts without applying them', async () => {
  const { retainedDraftKeys } = await import('./published-storage');
  localStorage.clear();
  writeDrafts(localStorage, scope, [route]);
  expect(retainedDraftKeys(localStorage, { ...scope, revision: '2' })).toEqual([
    draftKey(scope),
  ]);
  expect(readDrafts(localStorage, { ...scope, revision: '2' })).toEqual([]);
});
