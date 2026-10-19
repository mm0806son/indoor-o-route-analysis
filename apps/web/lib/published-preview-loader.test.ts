import { afterEach, expect, it, vi } from 'vitest';
import { loadViewerPublication } from './published-loader';
import { publishedA, manifest } from '../e2e/fixtures/publication';
const preview = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./publication-preview', () => ({
  readPublicationPreview: preview.read,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('loads a local preview without fetching the published manifest', async () => {
  preview.read.mockReturnValue(publishedA);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const loaded = await loadViewerPublication(
    'https://host/viewer?preview=local-token&event=other',
    sessionStorage,
  );
  expect(preview.read).toHaveBeenCalledWith('local-token', sessionStorage);
  expect(loaded.localPreview).toBe(true);
  expect(loaded.published).toBe(publishedA);
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not fall back to a public competition when preview storage is missing', async () => {
  preview.read.mockImplementation(() => {
    throw Error('本地预览不存在或已过期');
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    loadViewerPublication(
      'https://host/viewer?preview=expired',
      sessionStorage,
    ),
  ).rejects.toThrow('本地预览不存在');
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps ordinary published links on the existing manifest flow', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => manifest })
    .mockResolvedValueOnce({ ok: true, json: async () => publishedA });
  vi.stubGlobal('fetch', fetcher);
  const loaded = await loadViewerPublication(
    'https://host/viewer?event=race-a',
    sessionStorage,
  );
  expect(loaded.localPreview).toBe(false);
  expect(preview.read).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
