import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SettingsProvider, useSettings } from "./settings-context";

const STORAGE_KEYS = {
  PERSIST_DB: "app-persist-db",
  RUNNING_SPEED: "app-running-speed",
  ROUTE_ANALYSIS_K: "app-route-analysis-k",
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("throws when used outside SettingsProvider", () => {
    // Suppress the expected React error log for this negative test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSettings())).toThrow(
      "useSettings must be used within SettingsProvider"
    );
    spy.mockRestore();
  });

  it("defaults to runningSpeed=3.0, routeAnalysisK=6, persistToDB=true when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
    expect(result.current.routeAnalysisK).toBe(6);
    expect(result.current.persistToDB).toBe(true);
  });

  it("loads persisted values from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEYS.PERSIST_DB, "false");
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "4.5");
    localStorage.setItem(STORAGE_KEYS.ROUTE_ANALYSIS_K, "10");

    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.persistToDB).toBe(false);
    expect(result.current.runningSpeed).toBe(4.5);
    expect(result.current.routeAnalysisK).toBe(10);
  });

  it("ignores invalid persisted runningSpeed and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "not-a-number");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
  });

  it("ignores non-positive persisted runningSpeed and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "-1");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
  });

  it("ignores out-of-range persisted routeAnalysisK and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.ROUTE_ANALYSIS_K, "0");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.routeAnalysisK).toBe(6);
  });

  it("setPersistToDB updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setPersistToDB(false));

    expect(result.current.persistToDB).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PERSIST_DB)).toBe("false");
  });

  it("setRunningSpeed updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setRunningSpeed(5.25));

    expect(result.current.runningSpeed).toBe(5.25);
    expect(localStorage.getItem(STORAGE_KEYS.RUNNING_SPEED)).toBe("5.25");
  });

  it("setRouteAnalysisK updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setRouteAnalysisK(12));

    expect(result.current.routeAnalysisK).toBe(12);
    expect(localStorage.getItem(STORAGE_KEYS.ROUTE_ANALYSIS_K)).toBe("12");
  });
});
