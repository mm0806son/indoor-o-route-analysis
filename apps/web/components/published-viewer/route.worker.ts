import {
  createPublishedRouteAnalyzer,
  type PublishedEvent,
} from "@indoor-o-route-analysis/core";
import { analyzePublishedLeg } from "../../lib/published-route";

self.onmessage = (
  e: MessageEvent<{
    published: PublishedEvent;
    courseId: string;
    from: string;
    to: string;
    via: string[];
    runningSpeed?: number;
  }>,
) => {
  try {
    const { published, courseId, from, to, via, runningSpeed } = e.data;
    const analyzer = createPublishedRouteAnalyzer(published, courseId);
    // The UI terminates this worker on leg/waypoint changes or cancellation.
    // All bounded candidate search and metric calculation stay off the main thread.
    self.postMessage(
      analyzePublishedLeg(analyzer, from, to, via, runningSpeed),
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
