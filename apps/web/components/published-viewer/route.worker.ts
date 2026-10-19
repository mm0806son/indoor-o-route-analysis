import {
  createPublishedRouteAnalyzer,
  getActualCourseControls,
  type PublishedEvent,
} from "@indoor-o-route-analysis/core";
import {
  analyzePublishedLeg,
  previousShortestPathsForLeg,
} from "../../lib/published-route";

self.onmessage = (
  e: MessageEvent<{
    published: PublishedEvent;
    courseId: string;
    from: string;
    to: string;
    via: string[];
    runningSpeed?: number;
    legIndex?: number;
    includeVariants?: boolean;
  }>,
) => {
  try {
    const {
      published,
      courseId,
      from,
      to,
      via,
      runningSpeed,
      includeVariants,
    } = e.data;
    const analyzer = createPublishedRouteAnalyzer(published, courseId);
    const race = published.event.raceCourses?.find((r) =>
      r.courses?.some((c) => c.id === courseId),
    );
    const course = race?.courses?.find((c) => c.id === courseId);
    if (!course) throw Error("线路不存在");
    const controls = getActualCourseControls(
      course.controls,
      race?.controls ?? [],
    );
    const legIndex =
      e.data.legIndex ??
      controls.findIndex(
        (c, i) => c.controlId === from && controls[i + 1]?.controlId === to,
      );
    if (
      controls[legIndex]?.controlId !== from ||
      controls[legIndex + 1]?.controlId !== to
    )
      throw Error("赛段与线路不匹配");
    // Match the release course analyzer's repetition baseline, including a group's hidden shortest variant.
    // Work stays off the main thread; the UI terminates the worker to cancel stale leg/waypoint requests.
    const previousShortestPaths = previousShortestPathsForLeg(
      analyzer,
      { controls },
      legIndex,
    );
    self.postMessage({
      ...analyzePublishedLeg(analyzer, from, to, via, runningSpeed, {
        previousShortestPaths,
        includeVariants,
      }),
      previousShortestPaths,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
