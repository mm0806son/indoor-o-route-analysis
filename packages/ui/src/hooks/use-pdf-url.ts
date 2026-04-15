import { useMemo } from "react";
import type { MapData } from "@indoor-o-route-analysis/core";

/**
 * Hook to manage PDF URL from map data and blob URL
 * Consolidates the PDF loading logic used across multiple components
 */
export function usePdfUrl(map: MapData | undefined, pdfBlobUrl: string | null) {
  // Compute PDF URL directly from inputs without effects
  const pdfUrl = useMemo(() => {
    // Use blob URL if available (highest priority)
    if (pdfBlobUrl) {
      return pdfBlobUrl;
    }

    // No map available
    if (!map) {
      return null;
    }

    // Fallback to direct URL if it's an HTTP(S) URL
    if (map.image?.url && (map.image.url.startsWith("http") || map.image.url.startsWith("https"))) {
      return map.image.url;
    }
    
    return null;
  }, [map, pdfBlobUrl]);

  // Map is considered loading if we don't have a URL yet
  const isLoading = !pdfUrl;

  return { pdfUrl, isLoading };
}
