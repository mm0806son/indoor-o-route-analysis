'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  eventPosToMultiPagePixels,
  getDocumentDimensions,
  type MapData,
  type RaceCourseData,
} from '@indoor-o-route-analysis/core';
import {
  drawMutedGraph,
  drawHighlightedRoutes,
  drawLegControls,
  type RouteHighlight,
  type MinimalCanvas2DContext,
} from '@indoor-o-route-analysis/core/render';
import { loadPdfJs } from '@/lib/load-pdfjs';
import { publicationUrl } from '@/lib/published-loader';
export function PublishedMap({
  map,
  race,
  dataUrl,
  routes,
  leg,
  showGraph,
  onNode,
  fitToken,
  onImage,
}: {
  map: MapData;
  race: RaceCourseData;
  dataUrl: string;
  routes: RouteHighlight[];
  leg?: { fromNodeId: string; toNodeId: string };
  showGraph: boolean;
  onNode: (id: string) => void;
  fitToken: number;
  onImage: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null),
    [error, setError] = useState(''),
    [size, setSize] = useState({ width: 800, height: 600 }),
    [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const gesture = useRef<{
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const dims = getDocumentDimensions(map);
  const positions = useMemo(
    () =>
      new Map([
        ...(race.vertices ?? []).map(
          (n) => [n.id, eventPosToMultiPagePixels(n, map, 1)] as const,
        ),
        ...(race.controls ?? []).map(
          (c) =>
            [c.id, eventPosToMultiPagePixels(c.mapPosition, map, 1)] as const,
        ),
      ]),
    [race, map],
  );
  useEffect(() => {
    let active = true;
    let assetUrl: string | undefined;
    const controller = new AbortController();
    setImage(null);
    setError('');
    (async () => {
      let source = map.image.encodedData
        ? map.image.encodedData.startsWith('data:')
          ? map.image.encodedData
          : `data:${map.image.mediaType ?? 'application/pdf'};base64,${map.image.encodedData}`
        : publicationUrl(map.image.url ?? '', dataUrl);
      const isPdf =
        map.image.mediaType === 'application/pdf' ||
        source.startsWith('data:application/pdf') ||
        /\.pdf(?:\?|$)/i.test(source);
      if (!source.startsWith('data:')) {
        const response = await fetch(source, {
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) throw Error('地图资源加载失败');
        assetUrl = URL.createObjectURL(await response.blob());
        source = assetUrl;
      }
      const canvas = document.createElement('canvas');
      if (isPdf) {
        const pdfjs = await loadPdfJs();
        const pdf = await pdfjs.getDocument(source).promise;
        try {
          const first = await pdf.getPage(1),
            base = first.getViewport({ scale: 1 });
          const scale = Math.min(
            2,
            2500 /
              Math.max(
                base.width * (map.layout === 'horizontal' ? pdf.numPages : 1),
                base.height * (map.layout === 'vertical' ? pdf.numPages : 1),
              ),
          );
          const viewport = first.getViewport({ scale });
          canvas.width = Math.ceil(
            viewport.width * (map.layout === 'horizontal' ? pdf.numPages : 1),
          );
          canvas.height = Math.ceil(
            viewport.height * (map.layout === 'vertical' ? pdf.numPages : 1),
          );
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (
            let i = 1;
            i <= (map.layout === 'pages' ? 1 : pdf.numPages);
            i++
          ) {
            const page = await pdf.getPage(i);
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = viewport.width;
            pageCanvas.height = viewport.height;
            await page.render({
              canvas: pageCanvas,
              viewport: page.getViewport({ scale }),
            }).promise;
            ctx.drawImage(
              pageCanvas,
              map.layout === 'horizontal' ? (i - 1) * viewport.width : 0,
              map.layout === 'vertical' ? (i - 1) * viewport.height : 0,
            );
          }
        } finally {
          await pdf.destroy();
        }
      } else {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(Error('地图图片加载失败'));
          img.src = source;
        });
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
      }
      if (active) {
        setImage(canvas);
        onImage(canvas);
      }
    })().catch((e) => {
      if (active) setError(String(e.message ?? e));
    });
    return () => {
      active = false;
      controller.abort();
      if (assetUrl) URL.revokeObjectURL(assetUrl);
    };
  }, [map, dataUrl, onImage]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const fit =
    Math.min(size.width / dims.width, size.height / dims.height) * 0.94;
  useEffect(() => {
    setView({ x: 0, y: 0, zoom: 1 });
  }, [fitToken, map]);
  const scale = fit * view.zoom,
    offset = {
      x: (size.width - dims.width * scale) / 2 + view.x,
      y: (size.height - dims.height * scale) / 2 + view.y,
    };
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#17151d';
    ctx.fillRect(0, 0, size.width, size.height);
    if (image)
      ctx.drawImage(
        image,
        offset.x,
        offset.y,
        dims.width * scale,
        dims.height * scale,
      );
    const layout = {
      width: size.width,
      height: size.height,
      positions: new Map(
        [...positions].map(([id, p]) => [
          id,
          { x: offset.x + p.x * scale, y: offset.y + p.y * scale },
        ]),
      ),
    };
    const sharedContext = ctx as unknown as MinimalCanvas2DContext;
    if (showGraph) drawMutedGraph(sharedContext, race.edges ?? [], layout);
    drawHighlightedRoutes(sharedContext, routes, race.edges ?? [], layout);
    if (leg) drawLegControls(sharedContext, layout, leg);
  }, [
    size,
    image,
    positions,
    scale,
    offset.x,
    offset.y,
    dims.width,
    dims.height,
    race,
    showGraph,
    routes,
    leg,
  ]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stop = (e: MouseEvent) => e.preventDefault();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({
        ...v,
        zoom: Math.max(0.5, Math.min(12, v.zoom * Math.exp(-e.deltaY * 0.002))),
      }));
    };
    canvas.addEventListener('mousedown', stop);
    canvas.addEventListener('mousemove', stop);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('mousedown', stop);
      canvas.removeEventListener('mousemove', stop);
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);
  return (
    <div ref={host} className="published-map">
      {error && (
        <p role="alert" className="map-error">
          {error}
        </p>
      )}
      {!image && !error && <p className="map-error">正在加载地图…</p>}
      <canvas
        ref={ref}
        data-map-ready={image ? 'true' : 'false'}
        aria-label="比赛地图，点击节点设置途经点，拖动平移"
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size > 1) {
            const [a, b] = [...pointers.current.values()];
            pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
            if (gesture.current) gesture.current.moved = true;
            return;
          }
          gesture.current = {
            x: e.clientX,
            y: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          e.preventDefault();
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size > 1) {
            const [a, b] = [...pointers.current.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            const previous = pinchDistance.current;
            if (previous && distance)
              setView((v) => ({
                ...v,
                zoom: Math.max(
                  0.5,
                  Math.min(12, (v.zoom * distance) / previous),
                ),
              }));
            pinchDistance.current = distance;
            return;
          }
          const g = gesture.current;
          if (!g) return;
          if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) g.moved = true;
          if (g.moved)
            setView((v) => ({
              ...v,
              x: v.x + e.clientX - g.lastX,
              y: v.y + e.clientY - g.lastY,
            }));
          g.lastX = e.clientX;
          g.lastY = e.clientY;
        }}
        onPointerCancel={() => {
          pointers.current.clear();
          pinchDistance.current = null;
          gesture.current = null;
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          pointers.current.delete(e.pointerId);
          const wasPinching = pinchDistance.current !== null;
          pinchDistance.current = null;
          const g = gesture.current;
          gesture.current = null;
          if (wasPinching) {
            const remaining = [...pointers.current.values()][0];
            if (remaining)
              gesture.current = {
                ...remaining,
                lastX: remaining.x,
                lastY: remaining.y,
                moved: true,
              };
            return;
          }
          if (!g || g.moved) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          let best: string | undefined,
            distance = 24;
          for (const [id, pos] of positions) {
            const d = Math.hypot(
              pos.x * scale + offset.x - p.x,
              pos.y * scale + offset.y - p.y,
            );
            if (d < distance) {
              distance = d;
              best = id;
            }
          }
          if (best) onNode(best);
        }}
      />
      <div className="map-zoom">
        <button
          type="button"
          title="放大"
          aria-label="放大"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.min(12, v.zoom * 1.4) }))
          }
        >
          +
        </button>
        <button
          type="button"
          title="缩小"
          aria-label="缩小"
          onClick={() =>
            setView((v) => ({ ...v, zoom: Math.max(0.5, v.zoom / 1.4) }))
          }
        >
          −
        </button>
      </div>
    </div>
  );
}
