import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import PublishedViewer from './index';
import { publishedA } from '../../e2e/fixtures/publication';
const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/published-loader', () => ({
  loadViewerPublication: loader.load,
}));
vi.mock('./map', () => ({ PublishedMap: () => null }));
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  );
  window.history.replaceState({}, '', '/viewer?preview=test-token');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('clearly labels local preview and offers a return to the editor', async () => {
  loader.load.mockResolvedValue({
    published: publishedA,
    dataUrl: location.href,
    localPreview: true,
  });
  render(<PublishedViewer />);
  await waitFor(() =>
    expect(screen.getByText('本地预览 · 尚未在线发布')).toBeTruthy(),
  );
  expect(
    screen.getByRole('link', { name: '返回编辑器' }).getAttribute('href'),
  ).toBe('/');
  expect(screen.getByText('测试赛 A')).toBeTruthy();
});
it('explains missing preview and provides recovery without showing an unrelated event', async () => {
  loader.load.mockRejectedValue(Error('本地预览不存在或已过期'));
  render(<PublishedViewer />);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('本地预览不存在'),
  );
  expect(screen.getByRole('heading', { name: '本地预览' })).toBeTruthy();
  expect(screen.getByText(/请返回编辑器重新生成本地预览/)).toBeTruthy();
  expect(screen.queryByText('测试赛 A')).toBeNull();
});
