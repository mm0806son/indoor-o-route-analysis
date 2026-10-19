import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ pathname: "/", providerMount: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@indoor-o-route-analysis/ui", () => ({
  AppDataProvider: ({ children }: { children: React.ReactNode }) => {
    state.providerMount();
    return <section data-testid="editor-session">{children}</section>;
  },
}));
import { SessionBoundary, isPublishedSession } from "./session-boundary";
afterEach(() => {
  cleanup();
  state.providerMount.mockClear();
  state.pathname = "/";
});
describe("publication session isolation", () => {
  it("never opens organizer browser storage for a viewer URL", () => {
    state.pathname = "/viewer";
    render(
      <SessionBoundary>
        <p>Athlete</p>
      </SessionBoundary>,
    );
    expect(screen.getByText("Athlete")).toBeTruthy();
    expect(state.providerMount).not.toHaveBeenCalled();
  });
  it("retains the existing editor session for ordinary editor routes", () => {
    state.pathname = "/route-builder";
    render(
      <SessionBoundary>
        <p>Editor</p>
      </SessionBoundary>,
    );
    expect(screen.getByTestId("editor-session")).toBeTruthy();
  });
  it("isolates the fixed root in a publication build and recognizes trailing slash", () => {
    expect(isPublishedSession("/", true)).toBe(true);
    expect(isPublishedSession("/viewer/", false)).toBe(true);
    expect(isPublishedSession("/viewer-other", false)).toBe(false);
  });
});
