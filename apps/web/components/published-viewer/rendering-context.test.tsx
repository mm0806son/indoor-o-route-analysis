import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  RenderingDataProvider,
  useRenderingData,
} from "@indoor-o-route-analysis/ui";
import { publishedA } from "../../e2e/fixtures/publication";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders and updates shared scene data without initializing organizer storage", () => {
  vi.stubGlobal("React", React);
  const open = vi.fn(() => {
    throw Error("must not open organizer DB");
  });
  vi.stubGlobal("indexedDB", { open });
  function Consumer() {
    const { selectedEvent, runningSpeed } = useRenderingData();
    return (
      <p>
        {selectedEvent?.name}:{runningSpeed}
      </p>
    );
  }
  const view = render(
    <RenderingDataProvider selectedEvent={publishedA.event} runningSpeed={3}>
      <Consumer />
    </RenderingDataProvider>,
  );
  expect(screen.getByText("测试赛 A:3")).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  view.rerender(
    <RenderingDataProvider selectedEvent={publishedA.event} runningSpeed={5}>
      <Consumer />
    </RenderingDataProvider>,
  );
  expect(screen.getByText("测试赛 A:5")).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
});
