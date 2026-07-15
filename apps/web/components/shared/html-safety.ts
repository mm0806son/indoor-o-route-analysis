/**
 * Guards for rendering user-supplied strings (event/course data can come
 * from an imported file authored by someone else) safely: as literal HTML
 * text, and as a real, clickable link.
 */

/** Escapes &, <, >, " and ' so a string can be safely interpolated as HTML text or an attribute value. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Returns `url` unchanged if it's a real http(s) link, or `null` otherwise
 * (e.g. a `javascript:` URI, which — unlike escapeHtml — a text-content
 * escape can't neutralize once the string is used as a real `href`/`src`).
 * Use before rendering any user-supplied URL as a clickable link.
 */
export function safeHttpUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
