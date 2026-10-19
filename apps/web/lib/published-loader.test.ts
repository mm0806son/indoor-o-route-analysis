import { expect, it } from 'vitest';
import { publicationUrl } from './published-loader';
it('keeps publication asset requests local and relative', () => {
  expect(
    publicationUrl('events/r/1.json', 'https://host/published/manifest.json'),
  ).toBe('https://host/published/events/r/1.json');
  for (const path of [
    'https://elsewhere/data',
    '//elsewhere/data',
    '../private',
    '/data',
    'x\\y',
  ])
    expect(() =>
      publicationUrl(path, 'https://host/published/manifest.json'),
    ).toThrow();
});

import { afterEach, vi } from 'vitest';
import { loadPublication } from './published-loader';
import { manifest, publishedA } from '../e2e/fixtures/publication';
afterEach(() => vi.unstubAllGlobals());
it('revalidates manifest and rejects redirects on publication requests', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => manifest })
    .mockResolvedValueOnce({ ok: true, json: async () => publishedA });
  vi.stubGlobal('fetch', fetcher);
  const loaded = await loadPublication('https://host/published/manifest.json');
  expect(loaded.published.eventId).toBe('race-a');
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    'https://host/published/manifest.json',
    expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    'https://host/published/events/race-a/v1.json',
    expect.objectContaining({ redirect: 'error' }),
  );
});
it('does not request an archived event or a paused current event', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...manifest, currentEventId: null }),
    });
  vi.stubGlobal('fetch', fetcher);
  await expect(
    loadPublication('https://host/published/manifest.json'),
  ).rejects.toThrow('暂未开放比赛');
  await expect(
    loadPublication('https://host/published/manifest.json', 'archived'),
  ).rejects.toThrow('未公开或已归档');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects mismatched event revision instead of loading mixed official data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => manifest })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...publishedA, revision: 'v2' }),
      }),
  );
  await expect(
    loadPublication('https://host/published/manifest.json'),
  ).rejects.toThrow('版本不匹配');
});
it('reports missing manifest and failed data separately', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(
    loadPublication('https://host/published/manifest.json'),
  ).rejects.toThrow('清单');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => manifest })
      .mockResolvedValueOnce({ ok: false }),
  );
  await expect(
    loadPublication('https://host/published/manifest.json'),
  ).rejects.toThrow('数据加载失败');
});
it('rejects percent-encoded parent traversal', () =>
  expect(() =>
    publicationUrl('%2e%2e/private', 'https://host/published/manifest.json'),
  ).toThrow());
