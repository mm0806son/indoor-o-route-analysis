"use client";
import dynamic from "next/dynamic";
import { Component, useMemo, useState, type ReactNode } from "react";
import { RenderingDataProvider } from "@indoor-o-route-analysis/ui";
import type {
  EventData,
  MapData,
  RaceCourseData,
} from "@indoor-o-route-analysis/core";
import type { RouteHighlight } from "@indoor-o-route-analysis/core/render";
import { createPublishedScene } from "./model-adapter";
const SharedModel = dynamic(
  () => import("@/components/route-analysis/model-viewer"),
  { ssr: false, loading: () => <p className="model-loading">正在加载 3D…</p> },
);
class ModelBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="model-loading" role="alert">
        此设备无法显示 3D。<button onClick={this.props.onBack}>返回 2D</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function PublishedModel({
  event,
  race,
  map,
  routes,
  courseId,
  legIndex,
  runningSpeed,
  showBackgroundMap,
  showGraph,
  fitToken,
  onBack,
}: {
  event: EventData;
  race: RaceCourseData;
  map: MapData;
  routes: RouteHighlight[];
  courseId: string;
  legIndex: number;
  runningSpeed: number;
  showBackgroundMap: boolean;
  showGraph: boolean;
  fitToken: number;
  onBack: () => void;
}) {
  const scene = useMemo(
    () => createPublishedScene(event, race, map, routes),
    [event, race, map, routes],
  );
  const activeEvent = useMemo(
    () => createPublishedScene(event, race, map, []).event,
    [event, race, map],
  );
  const [ready, setReady] = useState(false);
  const encoded = map.image.encodedData;
  const url = encoded?.startsWith("data:")
    ? encoded
    : encoded
      ? `data:${map.image.mediaType ?? "application/pdf"};base64,${encoded}`
      : null;
  if (!race.polygons?.some((polygon) => polygon.points.length >= 3))
    return (
      <div className="published-model model-loading" role="status">
        这张地图尚未设置楼层模型。<button onClick={onBack}>返回 2D</button>
      </div>
    );
  return (
    <div
      className="published-model"
      data-testid="published-3d"
      data-map-visible={showBackgroundMap}
      data-model-ready={ready}
    >
      <ModelBoundary onBack={onBack}>
        <RenderingDataProvider
          selectedEvent={activeEvent}
          runningSpeed={runningSpeed}
        >
          <SharedModel
            pdfUrl={url}
            scale={map.scale}
            selectedCourseId={courseId}
            selectedLeg={legIndex}
            selectedRoute={null}
            isPlaying={false}
            customRouteSegments={scene.segments}
            showBackgroundMap={showBackgroundMap}
            showEdges={showGraph}
            onFrameAllTrigger={fitToken + 1}
            onReady={() => setReady(true)}
          />
        </RenderingDataProvider>
      </ModelBoundary>
    </div>
  );
}
