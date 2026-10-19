import {
  createPublishedRouteAnalyzer,
  type PublishedEvent,
} from '@indoor-o-route-analysis/core';
import { buildLeg, exploreLegs } from '../../lib/published-route';
self.onmessage = (
  e: MessageEvent<{
    published: PublishedEvent;
    courseId: string;
    from: string;
    to: string;
    via: string[];
  }>,
) => {
  try {
    const { published, courseId, from, to, via } = e.data;
    const analyzer = createPublishedRouteAnalyzer(published, courseId);
    self.postMessage({
      leg: buildLeg(analyzer, from, to, via),
      candidates: via.length ? [] : exploreLegs(analyzer, from, to),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
