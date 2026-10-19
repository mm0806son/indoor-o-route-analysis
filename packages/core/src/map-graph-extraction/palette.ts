/**
 * Pixel classification against the indoor kartnorm palette.
 *
 * Matching happens in CIELab, because equal RGB distances are not equal
 * perceptual distances and the inks that must be told apart (floor tints versus
 * light greys) are close in RGB but far apart perceptually.
 */

import type { BitMask, PaletteEntry, PixelRole, RasterImage } from "./types";
import { ROLE_NAMES, roleCode } from "./types";

/** A colour in CIE L*a*b*. */
interface Lab {
  l: number;
  a: number;
  b: number;
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

function srgbChannelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** Converts an 8-bit sRGB triple to CIE L*a*b* under a D65 white point. */
export function srgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  const x = labF((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / D65.x);
  const y = labF((0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / D65.y);
  const z = labF((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / D65.z);

  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

/** Euclidean distance in Lab (CIE76). Adequate here: the decisions are coarse. */
function deltaE(p: Lab, q: Lab): number {
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

export interface ClassifyOptions {
  /** Accept the nearest entry outright below this ΔE. */
  deltaEAccept: number;
  /** Above `deltaEAccept`, accept up to this ΔE only with a clear margin. */
  deltaEMarginAccept: number;
  /** Required ratio of best to runner-up ΔE for a margin acceptance. */
  deltaEMarginRatio: number;
}

export interface ClassifyResult {
  /** One role code per pixel, parallel to `ROLE_NAMES`. */
  classMap: Uint8Array;
  /**
   * Index into the palette per pixel, or -1 where nothing matched. Retained
   * because the role alone loses which ink matched, and stair variant depends
   * on telling the two stair inks apart.
   */
  entryMap: Int16Array;
  width: number;
  height: number;
  /** Pixel share per role, for diagnostics. Indexed like `ROLE_NAMES`. */
  roleFractions: number[];
  /**
   * The dominant colours that matched nothing, most frequent first. Surfaced to
   * the user when the palette does not fit the map.
   */
  unmatched: { rgb: [number, number, number]; fraction: number }[];
}

/**
 * Classifies every pixel to a palette role.
 *
 * A nearest-neighbour match always returns something, so an unconditional match
 * would mis-classify inks the palette does not contain — measured example: a
 * blue floor-panel frame matched "building" at ΔE 41 and would have become a
 * solid wall. Two acceptance rules guard against that:
 *
 * 1. ΔE below `deltaEAccept` is accepted outright.
 * 2. Between `deltaEAccept` and `deltaEMarginAccept`, the match is accepted only
 *    if it beats the runner-up by `deltaEMarginRatio`. This recovers legitimate
 *    tints of a palette ink (an apricot floor at ΔE 23.3 against a runner-up of
 *    39.8) without admitting unrelated colours (the blue frame at 31.0 against
 *    33.3 — no margin, so rejected).
 *
 * Anything else becomes `unknown`, which downstream treats as blocked. The
 * asymmetry is deliberate: a wrongly-blocked pixel narrows a corridor slightly,
 * whereas a wrongly-passable pixel can bridge two floors and produce edges that
 * walk between storeys.
 */
export function classifyPixels(
  image: RasterImage,
  palette: readonly PaletteEntry[],
  options: ClassifyOptions,
): ClassifyResult {
  const { width, height, data } = image;
  const pixelCount = width * height;
  const classMap = new Uint8Array(pixelCount);
  const entryMap = new Int16Array(pixelCount);

  const paletteLab = palette.map((entry) => srgbToLab(entry.rgb[0], entry.rgb[1], entry.rgb[2]));
  const paletteRole = palette.map((entry) => roleCode(entry.role));
  const unknownCode = roleCode("unknown");

  // Cache by packed RGB: maps use a few dozen distinct colours over millions of
  // pixels, so the Lab conversion runs orders of magnitude fewer times.
  const cache = new Map<number, { code: number; entry: number }>();
  const roleCounts = new Array<number>(ROLE_NAMES.length).fill(0);
  const unmatchedCounts = new Map<number, number>();

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const key = (r << 16) | (g << 8) | b;

    let hit = cache.get(key);
    if (hit === undefined) {
      const lab = srgbToLab(r, g, b);
      let best = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY;
      let bestIndex = -1;

      for (let p = 0; p < paletteLab.length; p++) {
        const d = deltaE(lab, paletteLab[p]);
        if (d < best) {
          second = best;
          best = d;
          bestIndex = p;
        } else if (d < second) {
          second = d;
        }
      }

      const accepted =
        bestIndex >= 0 &&
        (best < options.deltaEAccept ||
          (best < options.deltaEMarginAccept && best < options.deltaEMarginRatio * second));

      hit = accepted
        ? { code: paletteRole[bestIndex], entry: bestIndex }
        : { code: unknownCode, entry: -1 };
      cache.set(key, hit);
    }

    classMap[i] = hit.code;
    entryMap[i] = hit.entry;
    roleCounts[hit.code]++;
    if (hit.code === unknownCode) {
      unmatchedCounts.set(key, (unmatchedCounts.get(key) ?? 0) + 1);
    }
  }

  const unmatched = [...unmatchedCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([key, count]) => ({
      rgb: [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff] as [number, number, number],
      fraction: count / pixelCount,
    }));

  return {
    classMap,
    entryMap,
    width,
    height,
    roleFractions: roleCounts.map((c) => c / pixelCount),
    unmatched,
  };
}

/** Builds a mask selecting the pixels whose role is any of `roles`. */
export function maskForRoles(
  classMap: Uint8Array,
  width: number,
  height: number,
  roles: readonly PixelRole[],
): BitMask {
  const wanted = new Set(roles.map(roleCode));
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = wanted.has(classMap[i]) ? 1 : 0;
  }
  return { width, height, data };
}

/**
 * A learned colour table: one role per quantised RGB cell.
 *
 * Where {@link classifyPixels} asks "which listed ink is this nearest to", a
 * lookup table asks "what did this colour turn out to be on real maps". That
 * matters for scans, where JPEG artefacts, blur and paper cast move a colour far
 * enough from its nominal ink that a distance test starts guessing. Lookup costs
 * one array read regardless, and the table is small enough to ship inline.
 */
export interface ColourLut {
  /** Bits retained per channel; the table holds `(1 << bits) ** 3` entries. */
  bits: number;
  /** Role code per cell, indexed `(r << 2*bits) | (g << bits) | b`. */
  roles: Uint8Array;
  /** How many maps and augmented variants the table was counted over. */
  source: string;
}

/**
 * Classifies pixels through a learned table.
 *
 * Falls back to `unknown` for cells no training pixel ever landed in, which
 * downstream treats as blocked — the same safe direction the distance-based
 * classifier uses.
 */
export function classifyPixelsWithLut(
  image: RasterImage,
  lut: ColourLut,
  palette: readonly PaletteEntry[] = [],
): ClassifyResult {
  const { width, height, data } = image;
  const pixelCount = width * height;
  const classMap = new Uint8Array(pixelCount);
  const entryMap = new Int16Array(pixelCount).fill(-1);

  const shift = 8 - lut.bits;
  const bits = lut.bits;
  const unknownCode = roleCode("unknown");
  const stairsCode = roleCode("stairs");

  // The table answers "what role", not "which ink", and the two stair inks are a
  // single role. Variant is resolved by nearest ink among the stair entries only
  // - two well-separated candidates over 1.5% of the image, so the distance test
  // is safe here even where it would not be over the whole palette. Without this
  // every stair comes back as the first variant.
  const stairEntries = palette
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.stairVariant !== undefined);
  const stairLab = stairEntries.map(({ entry }) => srgbToLab(entry.rgb[0], entry.rgb[1], entry.rgb[2]));
  const roleCounts = new Array<number>(ROLE_NAMES.length).fill(0);
  const unmatchedCounts = new Map<number, number>();

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = data[o] >> shift;
    const g = data[o + 1] >> shift;
    const b = data[o + 2] >> shift;

    const code = lut.roles[((r << bits) | g) * (1 << bits) + b] ?? unknownCode;
    classMap[i] = code;
    roleCounts[code]++;

    if (code === stairsCode && stairEntries.length > 0) {
      const lab = srgbToLab(data[o], data[o + 1], data[o + 2]);
      let best = Number.POSITIVE_INFINITY;
      let bestIndex = stairEntries[0].index;
      for (let k = 0; k < stairLab.length; k++) {
        const dist = deltaE(lab, stairLab[k]);
        if (dist < best) {
          best = dist;
          bestIndex = stairEntries[k].index;
        }
      }
      entryMap[i] = bestIndex;
    }

    if (code === unknownCode) {
      const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
      unmatchedCounts.set(key, (unmatchedCounts.get(key) ?? 0) + 1);
    }
  }

  const unmatched = [...unmatchedCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([key, count]) => ({
      rgb: [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff] as [number, number, number],
      fraction: count / pixelCount,
    }));

  return {
    classMap,
    entryMap,
    width,
    height,
    roleFractions: roleCounts.map((c) => c / pixelCount),
    unmatched,
  };
}

/** Decodes a base64 table body into a {@link ColourLut}. */
export function decodeColourLut(bits: number, base64: string, source: string): ColourLut {
  // atob is global in both browsers and Node 16+, so no Buffer fallback: core
  // must not depend on Node globals, and the web app compiles these sources.
  const binary = atob(base64);
  const roles = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) roles[i] = binary.charCodeAt(i);
  return { bits, roles, source };
}
