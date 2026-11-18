/**
 * Garment drawings, as data. One source for two renderers:
 *  - components/Garments.astro turns these into SVG <symbol>s for the phone UI
 *  - scene/cloth.ts bakes them into height, normal and colour maps for the 3D flat-lay
 * Every shape lives in a 100 x 100 box.
 */
import type { GarmentKind } from './wardrobe';

export interface Detail {
  /** SVG path data */
  d?: string;
  /** Circle as [cx, cy, r] */
  c?: [number, number, number];
  mode: 'stroke' | 'fill';
  /** dark = seam or shadow, light = contrast stitching */
  tone: 'dark' | 'light';
  opacity: number;
  width?: number;
  dash?: string;
  round?: boolean;
}

export interface GarmentShape {
  body: string;
  details: Detail[];
}

const seam = (d: string, opacity: number, width: number, round = false): Detail => ({ d, mode: 'stroke', tone: 'dark', opacity, width, round });
const stitch = (d: string, opacity: number, width: number, round = false): Detail => ({ d, mode: 'stroke', tone: 'light', opacity, width, round });
const panel = (d: string, opacity: number): Detail => ({ d, mode: 'fill', tone: 'dark', opacity });
const button = (cx: number, cy: number): Detail => ({ c: [cx, cy, 1.6], mode: 'fill', tone: 'dark', opacity: 0.35 });

const trouserBody = 'M31 6 H69 L70.5 30 L74 95 H57.5 L50.5 36 H49.5 L42.5 95 H26 L29.5 30 Z';
const waistband = 'M31 6 H69 L69.4 12 H30.6 Z';
const sneakerUpper = 'M6 66 C5 58 13 54 25 52 C36 50 45 43 52 34 C54 31 58 30 61 32 C64 40 78 42 84 33 C87 32 90 34 90.5 38 L94 66 Z';
const sneakerSole = 'M6 66 H94 V70 Q95 78 88 78 H13 Q5 78 6 70 Z';
const loaferUpper = 'M5 68 C5 61 14 58 28 56 C40 54 48 50 56 44 C60 41 64 41 66 44 C70 50 80 50 85 43 C88 42 91 44 91.5 48 L94 68 Z';
const loaferSole = 'M5 68 H94 V71 Q94 77 86 77 H11 Q4 77 5 71 Z';

export const shapes: Record<GarmentKind, GarmentShape> = {
  tee: {
    body: 'M40 14 Q50 22 60 14 L80 21 Q84 22.5 86 26 L94 41 L81 47 L72 36 L72.5 86 Q50 90 27.5 86 L28 36 L19 47 L6 41 L14 26 Q16 22.5 20 21 Z',
    details: [
      seam('M40 14 Q50 22 60 14', 0.3, 2.4, true),
      seam('M92.2 37.6 L79.4 43.8 M7.8 37.6 L20.6 43.8', 0.14, 1.4),
      seam('M28 82.5 Q50 86.5 72 82.5', 0.1, 1.2),
    ],
  },
  shirt: {
    body: 'M38 12 L46 9 L50 15 L54 9 L62 12 L79 19 Q83 21 84.5 25 L96 72 L85.5 76 L72 42 L72.5 89 Q50 92 27.5 89 L28 42 L14.5 76 L4 72 L15.5 25 Q17 21 21 19 Z',
    details: [
      seam('M46 9 L50 23 L54 9', 0.3, 2, true),
      seam('M50 23 V90.5', 0.18, 1.6),
      button(50, 35),
      button(50, 48),
      button(50, 61),
      button(50, 74),
      seam('M94.8 66.4 L84.2 70.4 M5.2 66.4 L15.8 70.4', 0.16, 1.5),
      seam('M58 38 h8.5 v9 h-8.5 Z', 0.12, 1.2),
    ],
  },
  knit: {
    body: 'M37 13 Q50 21 63 13 L80 19 Q85 21 86.5 26 L97 70 L86 74.5 L74 44 L73 86 Q50 89.5 27 86 L26 44 L14 74.5 L3 70 L13.5 26 Q15 21 20 19 Z',
    details: [
      seam('M37 13 Q50 21 63 13', 0.3, 2.8, true),
      { d: 'M27.4 80 Q50 83.5 72.6 80', mode: 'stroke', tone: 'dark', opacity: 0.2, width: 2, dash: '1.5 2.2' },
      seam('M95.6 64.4 L84.6 68.8 M4.4 64.4 L15.4 68.8', 0.16, 1.6),
    ],
  },
  blazer: {
    body: 'M36 11 L47 8 L53 8 L64 11 L80 18 Q84.5 20 86 25 L96.5 74 L86 78 L73.5 44 L74 91 H26 L26.5 44 L14 78 L3.5 74 L14 25 Q15.5 20 20 18 Z',
    details: [
      panel('M47 8 L37 40 L50 54 L63 40 L53 8 L50 15 Z', 0.22),
      seam('M50 54 V91', 0.18, 1.6),
      button(47.4, 62),
      seam('M31 69 h10.5 M58.5 69 h10.5', 0.16, 1.6),
      seam('M60 45 h7.5', 0.14, 1.4),
      seam('M95.4 69 L84.8 73 M4.6 69 L15.2 73', 0.12, 1.3),
    ],
  },
  coat: {
    body: 'M36 9 L47 6 L53 6 L64 9 L80 15 Q84.5 17 86 22 L96 70 L85.5 74 L74 41 L75.5 97 H24.5 L26 41 L14.5 74 L4 70 L14 22 Q15.5 17 20 15 Z',
    details: [
      panel('M47 6 L38 36 L50 48 L62 36 L53 6 L50 13 Z', 0.2),
      seam('M50 48 V97', 0.18, 1.6),
      button(46.2, 58),
      button(46.2, 71),
      seam('M30 66 l9.5 -1.4 M60.5 64.6 l9.5 1.4', 0.18, 1.6),
      seam('M94.8 65 L84.2 69 M5.2 65 L15.8 69', 0.12, 1.3),
    ],
  },
  trousers: {
    body: trouserBody,
    details: [
      panel(waistband, 0.2),
      seam('M39.5 14 L34.5 95 M60.5 14 L65.5 95', 0.12, 1.3),
      seam('M50 12 V30', 0.16, 1.3),
      seam('M33.4 13 Q36.5 21 31.4 24.5 M66.6 13 Q63.5 21 68.6 24.5', 0.16, 1.3, true),
    ],
  },
  jeans: {
    body: trouserBody,
    details: [
      panel(waistband, 0.22),
      stitch('M33.4 13 Q37 21 31.2 24.5 M66.6 13 Q63 21 68.8 24.5', 0.4, 1.3, true),
      stitch('M50 12 V30 M53.6 12 V26 Q53.6 30 50 30', 0.3, 1.1, true),
      stitch('M30.6 30 L27.4 93 M69.4 30 L72.6 93', 0.22, 1.1),
      stitch('M26.4 91.4 H42.6 M57.4 91.4 H73.6', 0.3, 1.1),
    ],
  },
  sneaker: {
    body: `${sneakerUpper} ${sneakerSole}`,
    details: [
      panel(sneakerSole, 0.16),
      seam('M33 51 L40.5 56.5 M39 46.5 L46.5 52 M44.5 41.5 L52 47', 0.32, 1.6, true),
      seam('M52 34 C50 46 57 58 71 66', 0.18, 1.5, true),
      seam('M21.5 52.8 C25.5 57 25.5 62 23.5 66', 0.14, 1.4, true),
    ],
  },
  loafer: {
    body: `${loaferUpper} ${loaferSole}`,
    details: [
      panel(loaferSole, 0.3),
      seam('M17 59.6 C30 63.5 45 60.5 54.5 46', 0.26, 1.6, true),
      seam('M49.5 49.5 C53.5 55 60 57 66.5 54.5', 0.3, 2.2, true),
    ],
  },
};

/** Relative size on the sheet: a coat is longer than a tee, a shoe is small. */
export const sizeOf: Record<GarmentKind, number> = {
  tee: 0.9,
  shirt: 1,
  knit: 1,
  blazer: 1.04,
  coat: 1.2,
  trousers: 1.22,
  jeans: 1.22,
  sneaker: 0.56,
  loafer: 0.54,
};

/** How each cloth catches light in the 3D scene. */
export type Weave = 'plain' | 'rib' | 'twill' | 'leather';
export const weaveOf: Record<GarmentKind, Weave> = {
  tee: 'plain',
  shirt: 'plain',
  knit: 'rib',
  blazer: 'plain',
  coat: 'plain',
  trousers: 'plain',
  jeans: 'twill',
  sneaker: 'leather',
  loafer: 'leather',
};
