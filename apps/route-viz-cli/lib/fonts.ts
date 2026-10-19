import { GlobalFonts } from "@napi-rs/canvas";

/**
 * `@napi-rs/canvas` resolves a font string against its own registry, which
 * holds concrete family names only — it has no mapping for the CSS generic
 * families. A font string naming one therefore matches nothing and every
 * glyph comes out as a .notdef box, even though the system fonts are loaded.
 *
 * The viz font constants in `@indoor-o-route-analysis/core` say `sans-serif`
 * because the same constants drive the browser canvas, where the generic name
 * is the right thing to ask for. So the substitution happens here, on the one
 * context this CLI renders through, rather than in the shared constants.
 */

/** Concrete families to stand in for each CSS generic, best first. */
const GENERIC_FALLBACKS: Record<string, string[]> = {
  "sans-serif": ["DejaVu Sans", "Liberation Sans", "Noto Sans", "Arimo", "Arial"],
  serif: ["DejaVu Serif", "Liberation Serif", "Noto Serif", "Tinos", "Times New Roman"],
  monospace: ["DejaVu Sans Mono", "Liberation Mono", "Noto Sans Mono", "Cousine"],
};

function pickFamily(generic: string): string | null {
  const available = new Set(GlobalFonts.families.map((f) => f.family));
  for (const candidate of GENERIC_FALLBACKS[generic] ?? []) {
    if (available.has(candidate)) return candidate;
  }
  // Nothing from the preferred list — fall back to any family whose name hints
  // at the right shape, then to whatever is registered at all.
  const hint = generic === "monospace" ? /mono/i : generic === "serif" ? /serif/i : /sans/i;
  for (const family of available) {
    if (hint.test(family)) return family;
  }
  return available.values().next().value ?? null;
}

/** The concrete family that will stand in for `sans-serif`. */
export function resolveSansSerifFamily(): string | null {
  return pickFamily("sans-serif");
}

/**
 * Returns `ctx` with its `font` setter rewritten so CSS generic family names
 * resolve to a registered family. Mutates and returns the same object — the
 * canvas keeps rendering through it, so no drawing state is copied or lost.
 */
export function withResolvedGenericFonts<T extends { font: string }>(ctx: T): T {
  const descriptor = findFontDescriptor(ctx);
  if (!descriptor?.set || !descriptor.get) return ctx;

  const { get, set } = descriptor;
  const substitutions = new Map<string, string>();
  for (const generic of Object.keys(GENERIC_FALLBACKS)) {
    const family = pickFamily(generic);
    if (family && family !== generic) substitutions.set(generic, family);
  }
  if (substitutions.size === 0) return ctx;

  const pattern = new RegExp(`\\b(${[...substitutions.keys()].join("|")})\\b`, "g");

  Object.defineProperty(ctx, "font", {
    configurable: true,
    enumerable: true,
    get(this: T) {
      return get.call(this);
    },
    set(this: T, value: string) {
      set.call(this, value.replace(pattern, (name) => substitutions.get(name) ?? name));
    },
  });

  return ctx;
}

function findFontDescriptor(ctx: object): PropertyDescriptor | undefined {
  for (let o: object | null = ctx; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, "font");
    if (descriptor) return descriptor;
  }
  return undefined;
}
