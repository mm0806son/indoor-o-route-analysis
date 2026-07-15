import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePdfUrl } from "./use-pdf-url";
import type { MapData } from "@indoor-o-route-analysis/core";

function makeMap(imageUrl?: string): MapData {
  return {
    scale: 1000,
    image: imageUrl ? { url: imageUrl } : {},
    mapPositionTopLeft: { x: 0, y: 0 },
    layout: "horizontal",
  } as MapData;
}

describe("usePdfUrl", () => {
  it("returns null and isLoading true when there's no map or blob URL", () => {
    const { result } = renderHook(() => usePdfUrl(undefined, null));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("prefers the blob URL when one is available", () => {
    const { result } = renderHook(() => usePdfUrl(makeMap("https://example.com/map.pdf"), "blob:local-map"));
    expect(result.current.pdfUrl).toBe("blob:local-map");
    expect(result.current.isLoading).toBe(false);
  });

  it("uses the blob URL even when there's no map at all", () => {
    const { result } = renderHook(() => usePdfUrl(undefined, "blob:local-map"));
    expect(result.current.pdfUrl).toBe("blob:local-map");
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to an http(s) map image URL when no blob URL is set", () => {
    const { result } = renderHook(() => usePdfUrl(makeMap("https://example.com/map.pdf"), null));
    expect(result.current.pdfUrl).toBe("https://example.com/map.pdf");
    expect(result.current.isLoading).toBe(false);
  });

  it("ignores a non-http(s) map image URL and reports loading", () => {
    const { result } = renderHook(() => usePdfUrl(makeMap("data:application/pdf;base64,xyz"), null));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("returns null when the map has no image URL at all", () => {
    const { result } = renderHook(() => usePdfUrl(makeMap(), null));
    expect(result.current.pdfUrl).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
