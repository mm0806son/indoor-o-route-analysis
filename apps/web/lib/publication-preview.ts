import { parsePublishedEvent, type PublishedEvent } from '@indoor-o-route-analysis/core';
const PREFIX = 'indoor-o:publication-preview:';
function validated(input: unknown) {
  const published = parsePublishedEvent(input);
  for (const race of published.event.raceCourses ?? []) for (const map of race.maps ?? []) {
    if (!map.image.encodedData) throw new Error('本地预览需要嵌入地图，请先附加地图文件。');
  }
  return published;
}
export function savePublicationPreview(input: unknown, storage: Pick<Storage, 'setItem'>): string {
  const published=validated(input);
  const token=crypto.randomUUID();
  try { storage.setItem(PREFIX+token,JSON.stringify(published)); }
  catch { throw new Error('浏览器会话存储不可用或空间不足，请缩小地图后重试。'); }
  return token;
}
export function readPublicationPreview(token: string, storage: Pick<Storage, 'getItem'>): PublishedEvent {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) throw new Error('本地预览标识无效。');
  let value: string | null;
  try { value=storage.getItem(PREFIX+token); }
  catch { throw new Error('浏览器无法读取本地预览，请返回编辑器重试。'); }
  if (!value) throw new Error('本地预览已失效，请在原浏览器标签页重新生成预览。');
  return validated(JSON.parse(value));
}
