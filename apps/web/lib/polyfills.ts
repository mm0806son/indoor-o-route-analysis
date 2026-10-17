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

// crypto.randomUUID() is restricted to secure contexts in some browsers.
// A Tailscale-only HTTP deployment still has crypto.getRandomValues(), so use
// it to provide a standards-compliant UUID v4 without weakening randomness.
if (
  typeof globalThis.crypto !== "undefined" &&
  typeof globalThis.crypto.randomUUID !== "function"
) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}

export {};
