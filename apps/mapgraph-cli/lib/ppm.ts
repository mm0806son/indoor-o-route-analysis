import { readFileSync } from "node:fs";

import type { RasterImage } from "@indoor-o-route-analysis/core";

/**
 * Reads a binary PPM (P6) into a {@link RasterImage}.
 *
 * PPM is used as the interim raster input for the CLI because it needs no image
 * decoder: `pdftoppm map.pdf out` produces it directly. The Node-side pdf.js
 * adapter that would let the CLI take a PDF is still an open item in the design.
 */
export function readPpm(path: string): RasterImage {
  const buffer = readFileSync(path);

  let offset = 0;
  const tokens: number[] = [];

  const readToken = (): string => {
    // Skip whitespace and '#' comment lines, which PPM allows between fields.
    while (offset < buffer.length) {
      const ch = buffer[offset];
      if (ch === 0x23) {
        while (offset < buffer.length && buffer[offset] !== 0x0a) offset++;
        continue;
      }
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        offset++;
        continue;
      }
      break;
    }

    const start = offset;
    while (offset < buffer.length) {
      const ch = buffer[offset];
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) break;
      offset++;
    }
    return buffer.toString("ascii", start, offset);
  };

  const magic = readToken();
  if (magic !== "P6") throw new Error(`${path}: expected a binary PPM (P6), got "${magic}"`);

  for (let i = 0; i < 3; i++) tokens.push(Number.parseInt(readToken(), 10));
  const [width, height, maxValue] = tokens;
  if (maxValue !== 255) throw new Error(`${path}: only 8-bit PPM is supported, got maxval ${maxValue}`);

  offset++; // single whitespace byte before the pixel data

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = offset + i * 3;
    const dst = i * 4;
    data[dst] = buffer[src];
    data[dst + 1] = buffer[src + 1];
    data[dst + 2] = buffer[src + 2];
    data[dst + 3] = 255;
  }

  return { width, height, data };
}
