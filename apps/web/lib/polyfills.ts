/**
 * Browser polyfills for APIs not yet universally supported.
 * This file is imported once at app startup (layout.tsx).
 */

// URL.parse() — added in Safari 17.4 (March 2024). Used by pdfjs-dist v5+.
// Polyfill: same semantics but returns null on invalid URLs instead of throwing.
if (typeof URL.parse !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (URL as any).parse = (url: string, base?: string): URL | null => {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}
