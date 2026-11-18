/**
 * Garment drawings, as data. One source for two renderers:
 *  - components/Garments.astro turns these into SVG <symbol>s for the phone UI
 *  - scene/bake.ts turns them into relief, weave and colour maps for the 3D flat-lay
 * Every shape lives in a 100 x 100 box and is drawn the way the piece is made:
 * a body, then seams, bands, panels, openings, buttons and stitching.
 */
import type { GarmentKind } from './wardrobe';

/** Colours that do not follow the cloth. Tokens are resolved per item by each renderer. */
export type Paint = 'button' | 'tonal' | 'sole' | 'soleDark' | 'lace' | 'thread' | 'label' | 'rivet' | (string & {});

export interface Detail {
  /** SVG path data */
  d?: string;
  /** Circle as [cx, cy, r] */
  c?: [number, number, number];
  mode: 'stroke' | 'fill';
  /** dark = shadow in the cloth's own colour, light = worn or faded cloth, paint = its own colour */
  tone: 'dark' | 'light' | 'paint';
  opacity: number;
  width?: number;
  dash?: string;
  round?: boolean;
  color?: Paint;
  /** How it sits in the relief. seam sinks, proud sits above, hole is the inside of the garment, flat is colour only. */
  relief?: 'seam' | 'proud' | 'hole' | 'flat';
  /** Ribbed knit: cuffs, hems, neckbands */
  rib?: boolean;
  /** Soft-edged: a fade rather than a line */
  soft?: boolean;
}

/** A crease in the cloth. Positive depth is a ridge, negative a valley. 3D only. */
export interface Fold {
  d: string;
  depth: number;
  width: number;
}

export interface GarmentShape {
  body: string;
  details: Detail[];
  folds: Fold[];
  /** cloth lies flat with a hemmed edge; a shoe is a rounded volume */
  profile: 'cloth' | 'shoe';
  /** How far the piece stands off the sheet, in world units (a garment is about 1 unit wide). Cloth must stay under 0.017 so stacked pieces never cut through each other. */
  thickness: number;
}

/* ---------- path helpers ---------- */

/** Reflect path data about the vertical centre line (x → 100 − x). Supports M L H V C Q Z and l h v. */
export function mirror(d: string): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  const out: string[] = [];
  let cmd = '';
  let i = 0;
  const f = (n: number) => String(Math.round(n * 100) / 100);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      out.push(t);
      i++;
      continue;
    }
    const n = Number(t);
    switch (cmd) {
      case 'H':
        out.push(f(100 - n));
        i++;
        break;
      case 'h':
        out.push(f(-n));
        i++;
        break;
      case 'V':
      case 'v':
        out.push(f(n));
        i++;
        break;
      default: {
        // coordinate pairs
        const y = Number(tokens[i + 1]);
        out.push(f(cmd === cmd.toLowerCase() ? -n : 100 - n), f(y));
        i += 2;
      }
    }
  }
  return out.join(' ');
}
const both = (d: string) => `${d} ${mirror(d)}`;

const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
  const k = 0.5523;
  return `M${cx - rx} ${cy} C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry} C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy} C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry} C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy} Z`;
};

/* ---------- detail helpers ---------- */

const seam = (d: string, opacity = 0.2, width = 1): Detail => ({ d, mode: 'stroke', tone: 'dark', opacity, width, round: true });
/** The edge of one layer lying on another: a thin shadow line, no groove. */
const lip = (d: string, opacity = 0.26, width = 0.55): Detail => ({ d, mode: 'stroke', tone: 'dark', opacity, width, round: true, relief: 'flat' });
const shade = (d: string, opacity: number): Detail => ({ d, mode: 'fill', tone: 'dark', opacity, relief: 'flat' });
const panel = (d: string, opacity = 0.06): Detail => ({ d, mode: 'fill', tone: 'dark', opacity, relief: 'proud' });
const band = (d: string, width: number, rib = false): Detail => ({ d, mode: 'stroke', tone: 'dark', opacity: 0.05, width, relief: 'proud', rib });
const ribbed = (d: string): Detail => ({ d, mode: 'fill', tone: 'dark', opacity: 0.05, relief: 'proud', rib: true });
const inside = (d: string, opacity = 0.4): Detail => ({ d, mode: 'fill', tone: 'dark', opacity, relief: 'hole' });
const paint = (d: string, color: Paint, opacity = 1): Detail => ({ d, mode: 'fill', tone: 'paint', color, opacity, relief: 'flat' });
const line = (d: string, color: Paint, width: number, opacity = 1): Detail => ({ d, mode: 'stroke', tone: 'paint', color, opacity, width, round: true, relief: 'proud' });
const stitch = (d: string, width = 0.34, color: Paint = 'thread'): Detail => ({ d, mode: 'stroke', tone: 'paint', color, opacity: 0.85, width, dash: '0.8 0.5', relief: 'flat' });
const fade = (d: string, opacity: number, width: number): Detail => ({ d, mode: 'stroke', tone: 'light', opacity, width, round: true, relief: 'flat', soft: true });
const fold = (d: string, depth: number, width: number): Fold => ({ d, depth, width });

/** A sewn-on button: disc, rim and two holes. */
const button = (x: number, y: number, r = 1.25, color: Paint = 'button'): Detail[] => [
  { c: [x, y, r + 0.35], mode: 'fill', tone: 'dark', opacity: 0.22, relief: 'flat' },
  { c: [x, y, r], mode: 'fill', tone: 'paint', color, opacity: 1, relief: 'proud' },
  { c: [x - r * 0.3, y, r * 0.16], mode: 'fill', tone: 'dark', opacity: 0.6, relief: 'flat' },
  { c: [x + r * 0.3, y, r * 0.16], mode: 'fill', tone: 'dark', opacity: 0.6, relief: 'flat' },
];
const rivet = (x: number, y: number): Detail => ({ c: [x, y, 0.48], mode: 'fill', tone: 'paint', color: 'rivet', opacity: 1, relief: 'proud' });

/* ---------- tops ---------- */

const tee: GarmentShape = {
  profile: 'cloth',
  thickness: 0.01,
  body: 'M39 13 Q50 16.4 61 13 L79 20 Q83.5 21.6 86 25.5 L95 41.5 L82.5 48 L72.5 37.5 C73.6 52 73 70 73.8 87 Q50 91 26.2 87 C27 70 26.4 52 27.5 37.5 L17.5 48 L5 41.5 L14 25.5 Q16.5 21.6 21 20 Z',
  details: [
    inside('M39 13 Q50 16.4 61 13 Q50 25.4 39 13 Z', 0.36),
    paint('M47.3 15.6 h5.4 v2.9 h-5.4 Z', 'label', 0.9),
    band('M37.9 13.7 Q50 27.4 62.1 13.7', 3.1, true),
    seam('M39 13 Q50 25.4 61 13', 0.3, 0.8),
    seam('M36.5 14.6 Q50 29.6 63.5 14.6', 0.22, 0.8),
    seam(both('M79.4 20.2 C75.6 26 73.6 31.5 72.5 37.5'), 0.16, 0.9),
    seam(both('M93.3 38.5 L80.8 45'), 0.16, 0.8),
    seam('M26.6 83.4 Q50 87.4 73.4 83.4', 0.15, 0.8),
  ],
  folds: [
    fold('M71 41 C66 46 62 51 58.5 57', -0.55, 3.2),
    fold('M29.5 41 C33 48 36 54 39.5 62', -0.5, 3.4),
    fold('M44.5 40 C43 55 46 70 44 84', 0.45, 5),
    fold('M58.5 46 C60.5 58 57 72 59 85', -0.4, 4.6),
    fold('M83 27.5 C85 33 86 38 87.6 43', 0.4, 2.6),
    fold('M17 28 C15.4 34 13.6 38 12 43', -0.35, 2.6),
  ],
};

const shirt: GarmentShape = {
  profile: 'cloth',
  thickness: 0.01,
  body: 'M38.5 12.5 Q40 9.6 43 8.6 Q50 6.8 57 8.6 Q60 9.6 61.5 12.5 L79 18.6 Q83.4 20.4 85 24.6 C89 39 93 56 96.2 72.6 L86 76.4 C83 64 78.6 52 73.2 41.5 C73.8 56 73 74 73.6 87 Q62 92.5 50 89.5 Q38 92.5 26.4 87 C27 74 26.2 56 26.8 41.5 C21.4 52 17 64 14 76.4 L3.8 72.6 C7 56 11 39 15 24.6 Q16.6 20.4 21 18.6 Z',
  details: [
    inside('M43 9.2 Q50 7.6 57 9.2 L50 21 Z', 0.34),
    paint('M47.4 10.6 h5.2 v2.6 h-5.2 Z', 'label', 0.9),
    band('M50 21.5 V89.6', 4.3),
    seam('M47.85 22.6 V89.4 M52.15 22.6 V89.4', 0.17, 0.7),
    panel(both('M38.5 12.5 Q40 9.6 43 8.8 L50 21 L42.6 25.2 Z'), 0.04),
    lip(both('M43 8.8 L50 21 L42.6 25.2 L38.5 12.5'), 0.3),
    seam(both('M79 18.8 C76 26 74 33.5 73.2 41.5'), 0.16, 0.9),
    panel('M57.5 37.2 h9.6 v8.4 l-4.8 2.5 l-4.8 -2.5 Z', 0.03),
    lip('M57.5 37.2 h9.6 v8.4 l-4.8 2.5 l-4.8 -2.5 Z', 0.24),
    panel(both('M96.2 72.6 L86 76.4 L84.8 71 L95 67.2 Z'), 0.04),
    lip(both('M95 67.2 L84.8 71'), 0.28),
    seam(both('M88.6 70 L86.9 61.5'), 0.16, 0.7),
    seam('M27 84.6 Q38 90 50 87 Q62 90 73 84.6', 0.13, 0.8),
    ...button(50, 22.4, 1.05),
    ...button(50, 33.5),
    ...button(50, 44.6),
    ...button(50, 55.7),
    ...button(50, 66.8),
    ...button(50, 77.9),
    ...button(92.3, 71.6, 0.95),
    ...button(7.7, 71.6, 0.95),
  ],
  folds: [
    fold('M82.5 49 C85.5 48 88 49.6 90.5 49', -0.5, 2.2),
    fold('M83.6 54.4 C86 53.6 88.6 55.2 91.2 54.6', 0.45, 2),
    fold('M9.2 50 C11.8 51 14.6 49.6 17.4 50.4', -0.45, 2.2),
    fold('M8.6 56 C11 55.2 13.6 56.8 16.2 56', 0.4, 2),
    fold('M71.5 44 C66.5 48.5 63 53 60 59', -0.5, 3),
    fold('M28.5 44 C33 50 36 55 39 62', -0.45, 3.2),
    fold('M37 42 C35.6 56 38 72 36.4 86', 0.4, 4.6),
    fold('M63.5 50 C65 62 62.4 74 64 86', -0.35, 4.4),
  ],
};

const knit: GarmentShape = {
  profile: 'cloth',
  thickness: 0.016,
  body: 'M38 12.6 Q50 15.8 62 12.6 L80 18.5 Q85 20.4 86.8 25.5 C91 40 95 55 97.4 69.5 L86.4 74.6 C84 63 79.6 52.5 74.4 43.5 C75 56 74.2 72 74.8 85.5 Q50 89.6 25.2 85.5 C25.8 72 25 56 25.6 43.5 C20.4 52.5 16 63 13.6 74.6 L2.6 69.5 C5 55 9 40 13.2 25.5 Q15 20.4 20 18.5 Z',
  details: [
    inside('M38 12.6 Q50 15.8 62 12.6 Q50 24.4 38 12.6 Z', 0.38),
    band('M36.8 13.5 Q50 27 63.2 13.5', 4.2, true),
    seam('M38 12.6 Q50 24.4 62 12.6', 0.3, 0.9),
    seam('M35 14.8 Q50 30 65 14.8', 0.24, 0.9),
    ribbed('M25.2 79 Q50 83.2 74.8 79 L74.8 85.5 Q50 89.6 25.2 85.5 Z'),
    seam('M25.2 79 Q50 83.2 74.8 79', 0.24, 0.9),
    ribbed(both('M97.4 69.5 L86.4 74.6 L85.3 68.2 L96.3 63.1 Z')),
    seam(both('M96.3 63.1 L85.3 68.2'), 0.24, 0.9),
    seam(both('M80 18.7 C77 26 75.2 34 74.4 43.5'), 0.18, 1),
  ],
  folds: [
    fold('M84 55 C87 54 90 56 93 55.4', 0.5, 2.6),
    fold('M84.6 60.4 C87.4 59.6 90.4 61.4 93.6 60.6', -0.45, 2.4),
    fold('M6.6 56 C9.6 57 12.6 55.4 15.6 56.2', 0.45, 2.6),
    fold('M6.2 61.6 C9 60.8 12 62.6 15.2 61.6', -0.4, 2.4),
    fold('M72.5 46 C67 51 63.5 56 61 63', -0.45, 3.6),
    fold('M27.5 46 C32 52 35.6 58 38 66', -0.4, 3.8),
    fold('M47 36 C45.6 50 48.4 64 46.6 78', 0.35, 6),
  ],
};

/** Lapel and collar of a tailored jacket, left side; mirrored for the right. */
const lapel = (neck: number, top: number, tip: [number, number], notch: [number, number], collar: [number, number], shoulder: [number, number], stance: number) =>
  `M${neck} ${top} L49.4 ${stance} Q${tip[0] + 7} ${tip[1] + 15} ${tip[0]} ${tip[1]} L${notch[0]} ${notch[1]} L${collar[0]} ${collar[1]} L${shoulder[0]} ${shoulder[1]} Z`;

const blazerLapel = lapel(43.6, 9.4, [34.4, 28], [39.2, 24.8], [35.2, 21.8], [38.4, 11.4], 55.5);
const blazer: GarmentShape = {
  profile: 'cloth',
  thickness: 0.014,
  body: 'M39 10.5 Q50 7.6 61 10.5 L80.4 16.8 Q85 18.6 86.4 23.4 C90.4 39 94.2 57 96.6 74 L86.6 77.6 C84.4 65 80.6 53 75 42.5 C75.6 58 75 74 75.6 88.5 Q66 92.4 57 91 Q52.6 90 50.8 81 L49.2 81 Q47.4 90 43 91 Q34 92.4 24.4 88.5 C25 74 24.4 58 25 42.5 C19.4 53 15.6 65 13.4 77.6 L3.4 74 C5.8 57 9.6 39 13.6 23.4 Q15 18.6 19.6 16.8 Z',
  details: [
    inside('M43.6 9.4 Q50 7.8 56.4 9.4 L50.6 55.5 L49.4 55.5 Z', 0.5),
    paint('M47.2 11 h5.6 v3 h-5.6 Z', 'label', 0.8),
    panel(both(blazerLapel), 0.1),
    lip(both(blazerLapel), 0.34),
    seam(both('M39.2 24.8 L43.4 21'), 0.24, 0.8),
    lip('M50.4 56 C51.2 66 51.6 74 50.9 81', 0.36, 0.7),
    seam(both('M80.2 17 C77.4 25 75.6 33 75 42.5'), 0.17, 0.9),
    seam(both('M35 47 C34.6 55 35 61 35.2 65.8'), 0.1, 0.8),
    panel('M29.4 66.4 h11.8 v3.8 h-11.8 Z', 0.05),
    lip('M29.4 66.4 h11.8 v3.8 h-11.8 Z', 0.28),
    panel('M58.8 66.4 h11.8 v3.8 h-11.8 Z', 0.05),
    lip('M58.8 66.4 h11.8 v3.8 h-11.8 Z', 0.28),
    seam('M59.6 43.2 l8.6 -1.2 v2 l-8.6 1.2 Z', 0.26, 0.8),
    ...button(48.4, 58.4, 1.7, 'tonal'),
    ...button(48.4, 69, 1.7, 'tonal'),
    ...[0, 1, 2].flatMap((i) => [...button(93.5 - i * 0.55, 71 - i * 2.5, 0.75, 'tonal'), ...button(6.5 + i * 0.55, 71 - i * 2.5, 0.75, 'tonal')]),
  ],
  folds: [
    fold('M83.6 50 C86.4 49.2 89 50.6 91.6 50', -0.35, 2.2),
    fold('M8.6 51 C11.4 51.8 14 50.4 16.6 51.2', -0.3, 2.2),
    fold('M62 60 C63 70 61.4 79 62.4 88', 0.25, 5),
    fold('M33 74 C32.4 79 33 84 32.6 89', -0.22, 4),
  ],
};

const coatLapel = lapel(44, 7.4, [33.4, 23.4], [38.6, 20.4], [35, 17.4], [38.8, 9.2], 44.5);
const coat: GarmentShape = {
  profile: 'cloth',
  thickness: 0.016,
  body: 'M39.5 8.4 Q50 5.6 60.5 8.4 L79.4 14 Q83.6 15.6 85 20 C88.6 34 92 50 94.4 66 L85 69.4 C83 58 79.6 47.6 74.8 38.6 C75.8 58 76.4 78 77.6 96.6 Q50 99.2 22.4 96.6 C23.6 78 24.2 58 25.2 38.6 C20.4 47.6 17 58 15 69.4 L5.6 66 C8 50 11.4 34 15 20 Q16.4 15.6 20.6 14 Z',
  details: [
    inside('M44 7.4 Q50 6 56 7.4 L50.6 44.5 L49.4 44.5 Z', 0.5),
    paint('M47.2 9 h5.6 v3 h-5.6 Z', 'label', 0.8),
    panel(both(coatLapel), 0.1),
    lip(both(coatLapel), 0.34),
    seam(both('M38.6 20.4 L43.2 16.8'), 0.24, 0.8),
    lip('M50.5 45 C51.4 62 51.8 80 51.5 97.6', 0.36, 0.7),
    seam(both('M79.2 14.2 C76.8 22 75.2 30 74.8 38.6'), 0.17, 0.9),
    panel('M27.6 66.8 l12.2 -1 v4.2 l-12.2 1 Z', 0.05),
    lip('M27.6 66.8 l12.2 -1 v4.2 l-12.2 1 Z', 0.28),
    panel('M60.2 65.8 l12.2 1 v4.2 l-12.2 -1 Z', 0.05),
    lip('M60.2 65.8 l12.2 1 v4.2 l-12.2 -1 Z', 0.28),
    seam(both('M92.6 60.6 L83.8 63.8'), 0.2, 0.8),
    seam('M22.9 93.4 Q50 96 77.1 93.4', 0.12, 0.8),
    ...button(48.2, 47.4, 1.6, 'tonal'),
    ...button(48.2, 58.6, 1.6, 'tonal'),
    ...button(48.2, 69.8, 1.6, 'tonal'),
  ],
  folds: [
    fold('M37.6 50 C36.4 64 38.6 80 37 95', 0.3, 5.5),
    fold('M63.5 54 C64.8 68 62.6 82 64 95', -0.28, 5.5),
    fold('M30.5 74 C30 81 30.8 88 30.2 95', -0.2, 4),
    fold('M82 44 C84.6 43.2 87.4 44.8 90 44', -0.35, 2.2),
    fold('M10 45 C12.6 45.8 15.4 44.4 18 45.2', -0.3, 2.2),
  ],
};

/* ---------- legs ---------- */

const legs = 'M30.5 5 Q50 6.6 69.5 5 L70.6 13 C72 30 73.6 60 74.8 94.6 L58.6 95.6 C56.6 74 53.6 52 50.8 36.6 L49.2 36.6 C46.4 52 43.4 74 41.4 95.6 L25.2 94.6 C26.4 60 28 30 29.4 13 Z';
const waistband = 'M30.5 5 Q50 6.6 69.5 5 L70.3 11 Q50 12.6 29.7 11 Z';
const loops = [34.4, 42.6, 55.4, 63.6].map((x) => `M${x} 4.4 h2 v7.8 h-2 Z`).join(' ');
const legFolds: Fold[] = [
  fold('M48.4 33 C43.4 31 38.4 31.6 34 33.6', -0.4, 1.9),
  fold('M48.8 36.4 C44.4 37 40.2 39 36.4 42', -0.35, 1.9),
  fold('M51.6 33 C56.4 31.2 61.2 31.8 66 33.8', -0.4, 1.9),
  fold('M51.2 36.6 C55.6 37.4 59.8 39.2 63.4 42.4', -0.3, 1.9),
  fold('M30.6 57 C34.6 58.6 38.6 57.4 42.4 58.8', -0.35, 2.2),
  fold('M31 62 C34.6 61 38.4 62.6 42 61.6', 0.3, 2),
  fold('M57.8 58 C61.6 59.4 65.6 58 69.6 59.4', -0.32, 2.2),
  fold('M58.2 63.2 C61.8 62.2 65.6 63.8 69.2 62.8', 0.3, 2),
];

const trousers: GarmentShape = {
  profile: 'cloth',
  thickness: 0.012,
  body: legs,
  details: [
    panel(waistband, 0.08),
    seam('M29.7 11 Q50 12.6 70.3 11', 0.28, 0.9),
    panel(loops, 0.05),
    lip(loops, 0.26, 0.45),
    seam('M50 12.4 V28.4 M53.4 12.4 V24.6 Q53.4 29.6 50.2 30.4', 0.2, 0.8),
    seam('M50 30.4 V36.6', 0.24, 0.9),
    seam(both('M33 11.6 C33.6 18 32.2 23 30 26.8'), 0.26, 0.9),
    seam(both('M38.6 13 C37 40 35 68 33.4 95'), 0.12, 0.7),
    seam(both('M25.6 91.6 L41.8 92.6'), 0.15, 0.8),
    ...button(51.7, 8.3, 1.15, 'tonal'),
  ],
  folds: [...legFolds, fold('M38.6 13 C37 40 35 68 33.4 95', 0.3, 1.4), fold('M61.4 13 C63 40 65 68 66.6 95', 0.3, 1.4)],
};

const jeans: GarmentShape = {
  profile: 'cloth',
  thickness: 0.013,
  body: legs,
  details: [
    fade('M39.4 20 C38.2 34 37 48 36.2 60', 0.2, 8.5),
    fade('M60.6 20 C61.8 34 63 48 63.8 60', 0.2, 8.5),
    fade('M35 66 C34.4 72 34 78 33.6 84', 0.1, 6),
    fade('M65 66 C65.6 72 66 78 66.4 84', 0.1, 6),
    fade('M47.4 30.6 C43 29.4 38.6 29.8 34.4 31.6 M47.8 34 C43.6 34 39.6 35.6 36 38.4', 0.2, 1),
    fade('M52.6 30.6 C57 29.4 61.4 29.8 65.6 31.6 M52.2 34 C56.4 34 60.4 35.6 64 38.4', 0.2, 1),
    panel(waistband, 0.1),
    seam('M29.7 11 Q50 12.6 70.3 11', 0.3, 0.9),
    panel(loops, 0.14),
    lip(loops, 0.3, 0.45),
    seam('M50 12.4 V36.6', 0.26, 0.9),
    seam(both('M33.6 11.6 Q35.2 22.4 30 25.6'), 0.28, 1),
    seam(both('M25.5 90.2 L41.9 91.2'), 0.3, 1.1),
    stitch('M31.4 6.2 Q50 7.8 68.6 6.2'),
    stitch('M30.6 10 Q50 11.6 69.4 10'),
    stitch(both('M34.6 12 Q36.4 23 30.6 26.6')),
    stitch(both('M33 12 Q34.6 21.4 30.2 24.4')),
    stitch('M64.8 14.4 L68.8 14.9 L68.4 20.6'),
    stitch('M53.5 12.6 V24.4 Q53.5 29.6 50.4 30.4 M52.4 12.6 V24.2 Q52.4 28.4 50.4 29.2'),
    stitch(both('M30.6 27 C29.6 34 29 40 28.6 46')),
    stitch(both('M25.6 92.4 L41.8 93.4')),
    ...button(51.7, 8.2, 1.25, 'rivet'),
    rivet(34.2, 12.4),
    rivet(30.6, 26.2),
    rivet(65.8, 12.4),
    rivet(69.4, 26.2),
    rivet(64.9, 14.6),
  ],
  folds: legFolds,
};

/* ---------- shoes, seen from above, as a pair ---------- */

const shoeL = 'M27 5 C36 5 42.5 13 42.5 26 C42.5 38 39.5 46 38.5 58 C37.6 70 40 78 38.6 86 C37.4 92.5 32.5 95 27.6 95 C22 95 17.2 92.5 16 86 C14.4 77 16.5 68 15.6 58 C14.6 46 10.5 38 11 26 C11.5 13 18 5 27 5 Z';
const laceRows = [31.5, 37, 42.5, 48, 53.5];
const laces = laceRows.map((y, i) => `M${20.6 - i * 0.25} ${y + 0.9} L${33.4 + i * 0.25} ${y - 0.9}`).join(' ');

const sneaker: GarmentShape = {
  profile: 'shoe',
  thickness: 0.075,
  body: both(shoeL),
  details: [
    { d: both(shoeL), mode: 'stroke', tone: 'dark', opacity: 0.34, width: 4.1, relief: 'flat' },
    { d: both(shoeL), mode: 'stroke', tone: 'paint', color: 'sole', opacity: 1, width: 3.3, relief: 'flat' },
    seam(both('M13 21.5 C20 27.6 34 27.6 41 21.5'), 0.3, 0.9),
    seam(both('M20.8 29.5 C19.4 38 19 47 19.4 56 M33.2 29.5 C34.6 38 35 47 34.6 56'), 0.28, 0.9),
    shade(both('M21.4 29.6 L32.6 29.6 L33.8 56.5 L20.2 56.5 Z'), 0.1),
    seam(both('M16.4 62 C20 58.6 34 58.6 37.8 62'), 0.2, 0.8),
    inside(both(ellipse(27, 73, 8.3, 13.6)), 0.66),
    band(both(ellipse(27, 73, 8.3, 13.6)), 2.2),
    seam(both(ellipse(27, 73, 9.6, 14.9)), 0.22, 0.7),
    panel(both('M22.4 57.4 Q27 55 31.6 57.4 L31.2 64 Q27 66.2 22.8 64 Z'), 0.06),
    lip(both('M22.4 57.4 Q27 55 31.6 57.4 L31.2 64 Q27 66.2 22.8 64 Z'), 0.3),
    { d: both(laces), mode: 'stroke', tone: 'dark', opacity: 0.3, width: 2.1, round: true, relief: 'flat' },
    line(both(laces), 'lace', 1.35),
    panel(both('M24.8 88 h4.6 v5.4 h-4.6 Z'), 0.12),
    lip(both('M24.8 88 h4.6 v5.4 h-4.6 Z'), 0.26),
  ],
  folds: [fold(both('M15.6 31 C22 34.4 32 34.4 38.6 31'), -0.25, 1.8)],
};

const loaferL = 'M27 5.5 C33.6 5.5 38.8 12.6 39 25 C39.2 37 37.4 46 37 58 C36.6 70 38.4 78 37.4 86 C36.6 92.4 32 94.6 27.4 94.6 C22.6 94.6 18.2 92.4 17.4 86 C16.2 77 17.6 68 17 58 C16.4 46 14.8 37 15 25 C15.2 12.6 20.4 5.5 27 5.5 Z';
const apron = 'M19.4 31 C18.8 18 22 11 27 11 C32 11 35.2 18 34.6 31 C34.2 36.4 31.8 39.4 27 39.4 C22.2 39.4 19.8 36.4 19.4 31 Z';
const saddle = 'M16.4 42.6 C22.6 44.8 31.4 44.8 37.6 42.6 L37.4 49.6 C31.4 51.8 22.6 51.8 16.6 49.6 Z';

const loafer: GarmentShape = {
  profile: 'shoe',
  thickness: 0.06,
  body: both(loaferL),
  details: [
    { d: both(loaferL), mode: 'stroke', tone: 'paint', color: 'soleDark', opacity: 1, width: 1.8, relief: 'flat' },
    seam(both(apron), 0.3, 1),
    stitch(both(apron), 0.3, '#8a7663'),
    panel(both(saddle), 0.08),
    lip(both(saddle), 0.34),
    inside(both('M24.2 45.6 h5.6 v1.4 h-5.6 Z'), 0.7),
    inside(both(ellipse(27, 71.5, 7.4, 16)), 0.62),
    band(both(ellipse(27, 71.5, 7.4, 16)), 1.6),
    seam(both(ellipse(27, 71.5, 8.5, 17.1)), 0.24, 0.7),
    seam(both('M21.8 91.2 C25 92.6 29.2 92.6 32.4 91.2'), 0.2, 0.7),
  ],
  folds: [fold(both('M17.6 34.4 C22.4 37 31.6 37 36.4 34.4'), -0.3, 1.6)],
};

export const shapes: Record<GarmentKind, GarmentShape> = { tee, shirt, knit, blazer, coat, trousers, jeans, sneaker, loafer };

/** Relative size on the sheet: a coat is longer than a tee, a pair of shoes is small. */
export const sizeOf: Record<GarmentKind, number> = {
  tee: 0.92,
  shirt: 1,
  knit: 1.02,
  blazer: 1.06,
  coat: 1.24,
  trousers: 1.24,
  jeans: 1.24,
  sneaker: 0.6,
  loafer: 0.58,
};

/** What each piece is woven or made from, which decides how it catches light. */
export type Weave = 'jersey' | 'poplin' | 'knit' | 'wool' | 'gabardine' | 'denim' | 'leather';
export const weaveOf: Record<GarmentKind, Weave> = {
  tee: 'jersey',
  shirt: 'poplin',
  knit: 'knit',
  blazer: 'wool',
  coat: 'wool',
  trousers: 'gabardine',
  jeans: 'denim',
  sneaker: 'leather',
  loafer: 'leather',
};

/** Flat colours for the tokens, used by the SVG renderer (the 3D bake resolves them per item). */
export const paintHex: Record<string, string> = {
  button: '#4a3d33',
  tonal: '#22232a',
  sole: '#efece4',
  soleDark: '#1d1815',
  lace: '#f4f1ea',
  thread: '#c68a4c',
  label: '#e8e4d9',
  rivet: '#b0703c',
};
