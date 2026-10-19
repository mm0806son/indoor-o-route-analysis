import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { resolveSansSerifFamily, withResolvedGenericFonts } from "./fonts.js";

/**
 * The width the .notdef glyph box produces. Any real font renders the sample
 * string narrower than a run of uniform boxes, so a width equal to this is the
 * signature of unresolved-font tofu.
 */
function widthOf(font: string): number {
  const ctx = createCanvas(400, 100).getContext("2d");
  ctx.font = font;
  return ctx.measureText("36m White").width;
}

describe("resolveSansSerifFamily", () => {
  it("finds a concrete family that is not the generic keyword", () => {
    const family = resolveSansSerifFamily();
    expect(family).toBeTruthy();
    expect(family).not.toBe("sans-serif");
  });
});

describe("withResolvedGenericFonts", () => {
  it("renders 'sans-serif' as a real font rather than .notdef boxes", () => {
    const tofuWidth = widthOf("600 34px sans-serif");

    const canvas = createCanvas(400, 100);
    const ctx = withResolvedGenericFonts(canvas.getContext("2d"));
    ctx.font = "600 34px sans-serif";

    expect(ctx.measureText("36m White").width).not.toBeCloseTo(tofuWidth, 1);
  });

  it("leaves a concrete family untouched", () => {
    const canvas = createCanvas(400, 100);
    const ctx = withResolvedGenericFonts(canvas.getContext("2d"));
    ctx.font = "600 34px DejaVu Sans";

    expect(ctx.measureText("36m White").width).toBeCloseTo(
      widthOf("600 34px DejaVu Sans"),
      1,
    );
  });

  it("keeps the rest of the drawing surface usable", () => {
    const canvas = createCanvas(20, 10);
    const ctx = withResolvedGenericFonts(canvas.getContext("2d"));
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 20, 10);

    const [r, g, b] = ctx.getImageData(5, 5, 1, 1).data;
    expect([r, g, b]).toEqual([255, 0, 0]);
  });
});
