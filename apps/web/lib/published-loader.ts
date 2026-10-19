import {
  parsePublicationManifest,
  parsePublishedEvent,
} from '@indoor-o-route-analysis/core';
/** Only publication-relative resources are fetched. Never follow a manifest to another host. */
export function publicationUrl(path: string, base: string) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    decodeURIComponent(path).split('/').includes('..') ||
    /^[a-z]+:/i.test(path)
  )
    throw Error('发布资源路径无效');
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin) throw Error('不允许外部发布资源');
  return url.href;
}
export async function loadPublication(
  manifestUrl: string,
  eventId?: string,
  signal?: AbortSignal,
) {
  const response = await fetch(manifestUrl, {
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw Error('无法加载比赛清单，请重试。');
  const manifest = parsePublicationManifest(await response.json());
  const id = eventId ?? manifest.currentEventId;
  if (!id) throw Error('暂未开放比赛');
  const entry = manifest.events.find((e) => e.eventId === id);
  if (!entry) throw Error('这场比赛未公开或已归档');
  const dataUrl = publicationUrl(entry.path, manifestUrl);
  const data = await fetch(dataUrl, {
    cache: 'no-cache',
    redirect: 'error',
    signal,
  });
  if (!data.ok) throw Error('比赛数据加载失败，请重试。');
  const published = parsePublishedEvent(await data.json());
  if (
    published.eventId !== entry.eventId ||
    published.revision !== entry.revision
  )
    throw Error('比赛数据版本不匹配，请重新加载。');
  return { published, dataUrl };
}
