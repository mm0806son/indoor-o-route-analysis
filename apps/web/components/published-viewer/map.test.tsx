import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { PublishedMap } from './map';
const renderer = vi.hoisted(() => ({
  drawMutedGraph: vi.fn(),
  drawHighlightedRoutes: vi.fn(),
  drawLegControls: vi.fn(),
}));
vi.mock('@indoor-o-route-analysis/core/render', () => renderer);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('uses shared renderers with graph geometry and prevents native mouse selection', () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  );
  const map = {
    id: 'm',
    scale: 1000,
    layout: 'horizontal' as const,
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 100, y: 100 },
    image: {
      width: 100,
      height: 100,
      encodedData: 'data:image/png;base64,AA',
      mediaType: 'image/png',
    },
  };
  const edges = [{ from: 'S', to: 'F', label: '' }],
    routes = [{ path: ['S', 'F'], color: '#c084fc', progress: 1 }];
  const { getByLabelText } = render(
    <PublishedMap
      map={map}
      race={{
        vertices: [
          { id: 'S', x: 0, y: 0 },
          { id: 'F', x: 100, y: 100 },
        ],
        edges,
      }}
      dataUrl="https://host/published/data.json"
      routes={routes}
      leg={{ fromNodeId: 'S', toNodeId: 'F' }}
      showGraph
      onNode={() => {}}
      fitToken={0}
      onImage={() => {}}
    />,
  );
  expect(renderer.drawHighlightedRoutes).toHaveBeenCalledWith(
    context,
    routes,
    edges,
    expect.objectContaining({ positions: expect.any(Map) }),
  );
  expect(renderer.drawMutedGraph).toHaveBeenCalled();
  expect(renderer.drawLegControls).toHaveBeenCalled();
  const canvas = getByLabelText('比赛地图，点击节点设置途经点，拖动平移');
  expect(fireEvent.mouseDown(canvas)).toBe(false);
  expect(fireEvent.mouseMove(canvas)).toBe(false);
});

const pdfFixture = vi.hoisted(() => ({
  getDocument: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('@/lib/load-pdfjs', () => ({
  loadPdfJs: async () => ({ getDocument: pdfFixture.getDocument }),
}));
it('completes PDF rasterization before exposing downloadable map and clears loading', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const context = { scale: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  );
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 120 * scale,
    }),
    render: pdfFixture.render,
  };
  pdfFixture.render.mockReturnValue({ promise: Promise.resolve() });
  pdfFixture.destroy.mockResolvedValue(undefined);
  pdfFixture.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => page,
      destroy: pdfFixture.destroy,
    }),
  });
  const onImage = vi.fn();
  const map = {
    id: 'm',
    scale: 1000,
    layout: 'horizontal' as const,
    pageCount: 2,
    mapPositionTopLeft: { x: 0, y: 0 },
    mapPositionBottomRight: { x: 400, y: 120 },
    image: {
      width: 200,
      height: 120,
      mediaType: 'application/pdf',
      encodedData: 'JVBER',
    },
  };
  const screen = render(
    <PublishedMap
      map={map}
      race={{}}
      dataUrl="https://host/published/event.json"
      routes={[]}
      showGraph={false}
      onNode={() => {}}
      fitToken={0}
      onImage={onImage}
    />,
  );
  await waitFor(() => expect(onImage).toHaveBeenCalledOnce());
  const image = onImage.mock.calls[0][0] as HTMLCanvasElement;
  expect(image.width / image.height).toBeCloseTo(400 / 120);
  expect(pdfFixture.render).toHaveBeenCalledTimes(2);
  expect(pdfFixture.destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText('正在加载地图…')).toBeNull();
});
it('shows PDF failures and does not expose a blank downloadable map', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  pdfFixture.getDocument.mockReturnValue({
    promise: Promise.reject(Error('PDF 无法读取')),
  });
  const onImage = vi.fn();
  const screen = render(
    <PublishedMap
      map={{
        id: 'm',
        scale: 1000,
        layout: 'horizontal',
        mapPositionTopLeft: { x: 0, y: 0 },
        image: {
          width: 200,
          height: 120,
          mediaType: 'application/pdf',
          encodedData: 'JVBER',
        },
      }}
      race={{}}
      dataUrl="https://host/published/event.json"
      routes={[]}
      showGraph={false}
      onNode={() => {}}
      fitToken={0}
      onImage={onImage}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('PDF 无法读取'),
  );
  expect(onImage).not.toHaveBeenCalled();
});
