// GENERATED FILE - DO NOT EDIT BY HAND.
// Source: kartsymboler indoor (version 20241011).omap
//
// The violet inks are barriers, not decoration: 708.x Avspärning (barrier tape),
// 707.0 Opasserbar gränslinje and 707.1 Förbjudet område all use them, and a
// competitor may not cross any of those. Course overprint is a separate violet
// added by the course-setting software and is not part of this symbol set,
// which is why the ink can be treated as blocking by default.
//
// Roles come from the SYMBOL definitions that consume each colour, never from
// the colour names. "Svart 20% (genomgang. ej berg)" reads like "passage" but
// its only consuming symbol is 526.2 Skap o dyl (cupboards), an obstacle.
//
// Where an entry carries a measured sRGB, the naive DeviceCMYK conversion was
// too far from the rendered colour to match. That conversion is accurate for
// light tints and poor for saturated inks; see the design doc.

import type { PaletteEntry } from "./types";

export const INDOOR_KARTNORM_SOURCE = 'kartsymboler indoor (version 20241011).omap';

export const INDOOR_KARTNORM_PALETTE: readonly PaletteEntry[] = [
  { name: "Täckande violett", rgb: [198, 10, 141], role: "barrier" },  // measured; naive CMYK gives #F20DFF, dE 50.9
  { name: "Vit för bokstav", rgb: [255, 255, 255], role: "outside" },
  { name: "Svart", rgb: [0, 0, 0], role: "blocked" },
  { name: "Vit för trappil", rgb: [255, 255, 255], role: "outside" },
  { name: "Täckande violett, mindre prio", rgb: [198, 10, 141], role: "barrier" },  // same ink as Tackande violett
  { name: "Svart med mindre prio", rgb: [0, 0, 0], role: "blocked" },
  { name: "Förbjudet Område i Terräng", rgb: [247, 134, 247], role: "barrier" },
  { name: "Höjdkurva", rgb: [214, 82, 0], role: "passable" },
  { name: "Svart 50-65% (byggnad)", rgb: [148, 148, 148], role: "blocked" },
  { name: "Svart 20% (genomgång. ej berg)", rgb: [217, 217, 217], role: "furniture" },
  { name: "Grön", rgb: [89, 255, 38], role: "furniture" },
  { name: "Vatten", rgb: [0, 194, 242], role: "blocked" },
  { name: "Bord", rgb: [161, 255, 135], role: "furniture" },
  { name: "Soffa", rgb: [178, 204, 46], role: "furniture" },
  { name: "Enkelriktad", rgb: [242, 73, 0], role: "blocked" },
  { name: "Vit", rgb: [255, 255, 255], role: "outside" },
  { name: "Utepassage1", rgb: [115, 255, 255], role: "passable" },
  { name: "Utepassage2", rgb: [166, 255, 255], role: "passable" },
  { name: "Blå Trappa", rgb: [86, 140, 209], role: "stairs", stairVariant: "blue" },  // measured; naive CMYK gives #00CCFF, dE 31 - blue stairs went undetected
  { name: "Trappa", rgb: [239, 47, 44], role: "stairs", stairVariant: "red" },  // measured; naive CMYK gives #FF3300, dE 19.2
  { name: "Golv", rgb: [250, 227, 199], role: "passable" },

  // Inks observed on real maps that the kartnorm symbol set does not define.
  // Kept separate so every entry above stays traceable to the standard.
  // A walkable ramp/tribune surface. Previously scraped in via the margin rule at
  // a ratio of 0.59 against a 0.60 cutoff; adding palette entries moved its
  // runner-up and flipped it to unknown, which erased the graph over every
  // tribune. The margin rule is for tints of an ink already in the table, not for
  // discovering inks that are missing from it.
  { name: "observed: pale amber floor", rgb: [252, 216, 145], role: "passable" },
  { name: "observed: dark teal furniture", rgb: [32, 109, 125], role: "furniture" },
  { name: "observed: pale green furniture", rgb: [204, 236, 193], role: "furniture" },
] as const;
