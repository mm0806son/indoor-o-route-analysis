import type { CustomRoute } from '@indoor-o-route-analysis/core';
import { z } from 'zod';
export interface DraftScope {
  eventId: string;
  revision: string;
  courseId: string;
}
const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  courseId: z.string(),
  timestamp: z.string().optional(),
  legs: z.array(
    z.object({
      fromControlId: z.string(),
      toControlId: z.string(),
      path: z.array(
        z.object({
          nodeId: z.string(),
          legTime: z.number().finite().nonnegative().optional(),
        }),
      ),
    }),
  ),
});
const routesSchema = z.array(routeSchema);
export function draftKey(s: DraftScope) {
  return `published-drafts:${JSON.stringify([s.eventId, s.revision, s.courseId])}`;
}
export function readDrafts(
  storage: Pick<Storage, 'getItem'>,
  scope: DraftScope,
): CustomRoute[] {
  const value = storage.getItem(draftKey(scope));
  return value === null ? [] : routesSchema.parse(JSON.parse(value));
}
export function writeDrafts(
  storage: Pick<Storage, 'setItem'>,
  scope: DraftScope,
  routes: CustomRoute[],
) {
  storage.setItem(draftKey(scope), JSON.stringify(routesSchema.parse(routes)));
}
export function backupDrafts(scope: DraftScope, routes: CustomRoute[]) {
  return JSON.stringify({ schemaVersion: 1, ...scope, routes }, null, 2);
}
export function parseBackup(
  text: string,
  scope: DraftScope,
  nodeIds: Set<string>,
): CustomRoute[] {
  const value = z
    .object({
      schemaVersion: z.literal(1),
      eventId: z.string(),
      revision: z.string(),
      courseId: z.string(),
      routes: routesSchema,
    })
    .parse(JSON.parse(text));
  if (
    value.eventId !== scope.eventId ||
    value.revision !== scope.revision ||
    value.courseId !== scope.courseId
  )
    throw Error('备份属于其他比赛、版本或赛程；请打开原版本恢复。');
  for (const route of value.routes) {
    if (route.courseId !== scope.courseId) throw Error('赛程不匹配');
    for (const leg of route.legs)
      if (
        !nodeIds.has(leg.fromControlId) ||
        !nodeIds.has(leg.toControlId) ||
        leg.path.some((p) => !nodeIds.has(p.nodeId))
      )
        throw Error('备份引用了不存在的节点');
  }
  if (new Set(value.routes.map((r) => r.id)).size !== value.routes.length)
    throw Error('备份路线标识重复');
  return value.routes;
}

/** Detect retained drafts without migrating them onto a changed official graph. */
export function retainedDraftKeys(
  storage: Pick<Storage, 'length' | 'key'>,
  scope: DraftScope,
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith('published-drafts:')) continue;
    try {
      const [eventId, revision, courseId] = JSON.parse(
        key.slice('published-drafts:'.length),
      );
      if (
        eventId === scope.eventId &&
        courseId === scope.courseId &&
        revision !== scope.revision
      )
        keys.push(key);
    } catch {
      /* unrelated malformed storage key */
    }
  }
  return keys;
}
