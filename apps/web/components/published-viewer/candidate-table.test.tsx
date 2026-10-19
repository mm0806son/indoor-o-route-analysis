import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { CandidateTable, formatRouteTime } from "./candidate-table";
afterEach(cleanup);
it("shows six directly selectable alternatives with distance, difference, time and difficulty", () => {
  vi.stubGlobal("React", React);
  const rows = Array.from({ length: 6 }, (_, i) => ({
    distance: 100 + i * 5,
    distanceDelta: i * 5,
    distanceRatio: 1 + i * 0.05,
    estimatedTime: 30 + i,
    timeDelta: i,
    difficulty: 20 + i,
    totalClimb: 0,
    description: "",
  }));
  const select = vi.fn();
  render(<CandidateTable metrics={rows} selected={0} onSelect={select} />);
  const table = screen.getByRole("table", { name: "候选路线" });
  expect(within(table).getAllByRole("row")).toHaveLength(7);
  expect(screen.getByRole("columnheader", { name: "长度" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "较最短" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "选择方案 6" }));
  expect(select).toHaveBeenCalledWith(5);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByText(/组织者推荐/)).toBeNull();
});

it("formats time like the Route Builder summary", () => {
  expect(formatRouteTime(92.7004 / 5)).toBe("0:18");
});
