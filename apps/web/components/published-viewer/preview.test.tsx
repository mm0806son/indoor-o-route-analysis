import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import PublishedViewer from './index';
import { publishedA } from '../../e2e/fixtures/publication';
const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/published-loader', () => ({
  loadViewerPublication: loader.load,
}));
vi.mock('./map', () => ({
  PublishedMap: ({
    routes,
    onNode,
  }: {
    routes: unknown[];
    onNode: (id: string) => void;
  }) => (
    <>
      <div data-testid="map-routes">{routes.length}</div>
      <button onClick={() => onNode('B')}>测试途经点</button>
    </>
  ),
}));
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

it('renders automatic candidate comparison and saves a leg into the full route table', async () => {
  const legs = ['A', 'B'].map((id) => ({
    fromControlId: 'S',
    toControlId: '31',
    path: ['S', id, '31'].map((nodeId) => ({ nodeId })),
  }));
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: (event: { data: unknown }) => void;
      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              leg: legs[0],
              candidates: legs,
              candidateMetrics: legs.map((_, index) => ({
                distance: 100 + index,
                distanceDelta: index,
                distanceRatio: 1 + index / 100,
                estimatedTime: 20,
                difficulty: 12,
                timeDelta: 0,
                description: '',
              })),
            },
          }),
        );
      }
      terminate() {}
    },
  );
  loader.load.mockResolvedValue({
    published: publishedA,
    dataUrl: location.href,
    localPreview: false,
  });
  render(<PublishedViewer />);
  await waitFor(() =>
    expect(screen.getByRole('list', { name: '候选路线' })).toBeTruthy(),
  );
  expect(screen.getByTestId('map-routes').textContent).toBe('2');
  expect(screen.queryByText(/组织者推荐/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '选择方案 2' }));
  expect(
    screen
      .getByRole('button', { name: '选择方案 2' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '采用此赛段' }));
  expect(screen.getByRole('table', { name: '我的路线赛段' })).toBeTruthy();
  expect(screen.getByText('待完成')).toBeTruthy();
});

it('updates speed metrics without restarting search or changing the selected path', async () => {
  const searches = vi.fn();
  const legs = ['A', 'B'].map((id) => ({
    fromControlId: 'S',
    toControlId: '31',
    path: ['S', id, '31'].map((nodeId) => ({ nodeId })),
  }));
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: (event: { data: unknown }) => void;
      postMessage() {
        searches();
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              leg: legs[0],
              candidates: legs,
              candidateMetrics: legs.map((_, index) => ({
                distance: 100 + index * 20,
                distanceDelta: index * 20,
                distanceRatio: 1 + index * 0.2,
                estimatedTime: 20 + index * 4,
                difficulty: 12,
                timeDelta: index * 4,
                description: '',
              })),
            },
          }),
        );
      }
      terminate() {}
    },
  );
  loader.load.mockResolvedValue({
    published: publishedA,
    dataUrl: location.href,
    localPreview: false,
  });
  render(<PublishedViewer />);
  await screen.findByRole('button', { name: '选择方案 2' });
  fireEvent.click(screen.getByRole('button', { name: '选择方案 2' }));
  searches.mockClear();
  fireEvent.change(screen.getByLabelText('预计速度'), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: '选择方案 2' })
        .getAttribute('aria-pressed'),
    ).toBe('true'),
  );
  expect(searches).not.toHaveBeenCalled();
  expect(
    within(screen.getByRole('list', { name: '候选路线' })).getByText('0:12'),
  ).toBeTruthy();
});
it('shows distance time and difficulty for a via path alongside automatic candidates', async () => {
  const leg = (id: string) => ({
    fromControlId: 'S',
    toControlId: '31',
    path: ['S', id, '31'].map((nodeId) => ({ nodeId })),
  });
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: (event: { data: unknown }) => void;
      postMessage(request: { via: string[] }) {
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              leg: leg(request.via.length ? 'B' : 'A'),
              candidates: [leg('A')],
              candidateMetrics: [
                {
                  distance: 100,
                  distanceDelta: 0,
                  distanceRatio: 1,
                  estimatedTime: 20,
                  difficulty: 12,
                  timeDelta: 0,
                  description: '',
                },
              ],
            },
          }),
        );
      }
      terminate() {}
    },
  );
  loader.load.mockResolvedValue({
    published: publishedA,
    dataUrl: location.href,
    localPreview: false,
  });
  render(<PublishedViewer />);
  await screen.findByRole('list', { name: '候选路线' });
  fireEvent.click(screen.getByRole('button', { name: '测试途经点' }));
  const summary = await screen.findByRole('group', { name: '途经点路线指标' });
  expect(summary.textContent).toContain('m');
  expect(summary.textContent).toMatch(/\d+:\d{2}/);
  expect(summary.textContent).toMatch(/D\d+/);
  expect(screen.getByRole('list', { name: '候选路线' })).toBeTruthy();
});
