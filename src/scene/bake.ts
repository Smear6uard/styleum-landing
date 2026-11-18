/**
 * Bakes a garment drawing into the maps that make it read as real cloth:
 *  - a relief (hems, seams, bands, folds, buttons) turned into a normal map,
 *    with the weave itself laid over it thread by thread
 *  - a coarse height map for the mesh
 *  - one colour map per item: dyed yarn, shading in the folds, fades,
 *    stitching, buttons, soles and laces in their own colours
 * Pure typed-array work with no three.js and no DOM, so it runs in a worker.
 */
import { shapes, weaveOf, paintHex, type Detail, type Weave } from '../content/garments';
import type { GarmentKind } from '../content/wardrobe';

export interface BakeItem {
  id: string;
  color: string;
  material: string;
}
export interface BakeJob {
  kind: GarmentKind;
  size: number;
  items: BakeItem[];
}
export interface BakeResult {
  kind: GarmentKind;
  size: number;
  /** RGBA, bottom row first */
  normal: Uint8Array;
  height: Uint8Array;
  heightSize: number;
  /** stored height is relief / HEIGHT_RANGE */
  albedo: { id: string; data: Uint8Array }[];
}

/** Relief can rise above the plateau (folds, bands); the height map stores relief / this. */
export const HEIGHT_RANGE = 1.6;
const HEIGHT_SIZE = 256;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCtx(n: number): Ctx {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx;
  ctx.scale(n / 100, n / 100);
  return ctx;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Three box blurs approximate a gaussian. */
export function blur(src: Float32Array, n: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const w = 2 * r + 1;
  let a = src;
  const b = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < n; y++) {
      const row = y * n;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + (x < 0 ? 0 : x >= n ? n - 1 : x)];
      for (let x = 0; x < n; x++) {
        b[row + x] = acc / w;
        const add = x + r + 1;
        const sub = x - r;
        acc += a[row + (add >= n ? n - 1 : add)] - a[row + (sub < 0 ? 0 : sub)];
      }
    }
    for (let x = 0; x < n; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[(y < 0 ? 0 : y >= n ? n - 1 : y) * n + x];
      for (let y = 0; y < n; y++) {
        out[y * n + x] = acc / w;
        const add = y + r + 1;
        const sub = y - r;
        acc += b[(add >= n ? n - 1 : add) * n + x] - b[(sub < 0 ? 0 : sub) * n + x];
      }
    }
    a = out;
  }
  return out;
}

/** Integer hash to 0..1: one value per thread. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Smooth value noise on the hash lattice. */
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function trace(ctx: Ctx, p: { d?: string; c?: [number, number, number]; mode: 'stroke' | 'fill'; width?: number; dash?: string; round?: boolean }) {
  if (p.c) {
    ctx.beginPath();
    ctx.arc(p.c[0], p.c[1], p.c[2], 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (!p.d) return;
  const path = new Path2D(p.d);
  if (p.mode === 'fill') {
    ctx.fill(path);
    return;
  }
  ctx.lineWidth = p.width ?? 1;
  ctx.lineCap = p.round ? 'round' : 'butt';
  ctx.lineJoin = 'round';
  ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []);
  ctx.stroke(path);
}

/** Paint three independent layers into the R, G and B of one canvas, then read them apart. */
function layers(n: number, draw: (ctx: Ctx, ink: (channel: 0 | 1 | 2, amount: number) => void) => void): [Float32Array, Float32Array, Float32Array] {
  const ctx = makeCtx(n);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 100, 100);
  ctx.globalCompositeOperation = 'lighter';
  draw(ctx, (channel, amount) => {
    const v = Math.round(clamp01(amount) * 255);
    const c = `rgb(${channel === 0 ? v : 0},${channel === 1 ? v : 0},${channel === 2 ? v : 0})`;
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
  });
  const px = ctx.getImageData(0, 0, n, n).data;
  const r = new Float32Array(n * n);
  const g = new Float32Array(n * n);
  const b = new Float32Array(n * n);
  for (let i = 0, j = 0; i < r.length; i++, j += 4) {
    r[i] = px[j] / 255;
    g[i] = px[j + 1] / 255;
    b[i] = px[j + 2] / 255;
  }
  return [r, g, b];
}

const reliefOf = (p: Detail) => p.relief ?? (p.mode === 'stroke' ? 'seam' : 'proud');

/* ---------- colour ---------- */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const SRGB = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) {
  const l = i / 4096;
  SRGB[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
}
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = toLinear(i / 255);

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [toLinear(((v >> 16) & 255) / 255), toLinear(((v >> 8) & 255) / 255), toLinear((v & 255) / 255)];
}
const toHex = (c: [number, number, number]) =>
  '#' + c.map((l) => SRGB[Math.round(clamp01(l) * 4096)].toString(16).padStart(2, '0')).join('');

/** Buttons, soles and thread take a colour that suits the piece they are sewn to. */
function resolvePaint(token: string, base: [number, number, number], item: BakeItem): string {
  const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
  switch (token) {
    case 'button':
      return lum > 0.2 ? '#4a3d33' : '#cfc7b8';
    case 'tonal':
      return toHex([base[0] * 0.42 + 0.004, base[1] * 0.42 + 0.004, base[2] * 0.42 + 0.004]);
    case 'lace':
      return lum > 0.5 ? '#fbfaf6' : '#eeebe2';
    case 'soleDark':
      return item.material === 'Suede' ? '#2b1c17' : '#17130f';
    default:
      return paintHex[token] ?? token;
  }
}

/* ---------- the weave ---------- */

interface Thread {
  /** relief of the weave at a pixel, about -1..1 */
  bump(x: number, y: number): number;
  /** colour of the weave at a pixel, multiplier around 1 */
  dye(x: number, y: number): number;
  /** surface slope the bump should reach */
  slope: number;
  /** period in pixels, used to turn slope into amplitude */
  period: number;
  /** how readily the cloth rumples at a small scale, 0..1 */
  crease: number;
}

function thread(weave: Weave, n: number, seed: number, material: string): Thread {
  const TAU = Math.PI * 2;
  switch (weave) {
    case 'jersey': {
      const p = 3;
      return {
        period: p,
        slope: 0.2,
        crease: 0.75,
        bump: (x, y) => Math.sin((x / p) * TAU) * (0.75 + 0.25 * Math.sin((y / (p * 1.6)) * TAU)),
        dye: (x, y) => 0.955 + 0.05 * hash(x, y, seed) + 0.05 * vnoise(x / 7, y / 11, seed + 3),
      };
    }
    case 'poplin': {
      const p = 2.6;
      return {
        period: p,
        slope: 0.15,
        crease: 1,
        bump: (x, y) => Math.sin((x / p) * TAU) * Math.sin((y / p) * TAU),
        dye: (x, y) => 0.96 + 0.04 * hash(x, y, seed) + 0.045 * vnoise(x / 9, y / 9, seed + 3),
      };
    }
    case 'knit': {
      // stockinette: columns of little V stitches
      const p = n / 66;
      const stitch = (x: number, y: number) => {
        const cx = x / p - Math.floor(x / p) - 0.5;
        return Math.cos(cx * TAU) * 0.6 + Math.cos((y / (p * 0.72) + Math.abs(cx) * 1.2) * TAU) * 0.4;
      };
      return {
        period: p,
        slope: 0.55,
        crease: 0.1,
        bump: stitch,
        dye: (x, y) => 0.93 + 0.05 * stitch(x, y) + 0.1 * hash(x >> 1, y >> 1, seed),
      };
    }
    case 'wool': {
      // felted and brushed: no visible weave, only a soft melange
      return {
        period: 5,
        slope: 0.3,
        crease: 0.12,
        bump: (x, y) => vnoise(x / 1.7, y / 1.7, seed) + vnoise(x / 4.6, y / 4.6, seed + 1) - 1,
        dye: (x, y) => 0.86 + 0.1 * vnoise(x / 2.2, y / 2.2, seed + 5) + 0.1 * vnoise(x / 6, y / 6, seed + 6) + 0.08 * hash(x, y, seed),
      };
    }
    case 'gabardine': {
      const p = 3;
      return {
        period: p,
        slope: 0.15,
        crease: 0.5,
        bump: (x, y) => Math.sin(((x + y) / p) * TAU),
        dye: (x, y) => 0.95 + 0.02 * Math.sin(((x + y) / p) * TAU) + 0.04 * hash(x, y, seed) + 0.05 * vnoise(x / 8, y / 8, seed + 3),
      };
    }
    case 'denim': {
      // indigo warp over a white weft: a diagonal twill with slubby vertical streaks
      const p = 3.4;
      return {
        period: p,
        slope: 0.26,
        crease: 0.45,
        bump: (x, y) => Math.sin(((x + y) / p) * TAU),
        dye: (x, y) => {
          const twill = 0.5 + 0.5 * Math.sin(((x + y) / p) * TAU);
          const slub = vnoise(x / 2.4, y / 46, seed + 9) - 0.5;
          return (0.86 + 0.2 * twill) * (1 + slub * 0.22) * (0.97 + 0.06 * hash(x, y, seed));
        },
      };
    }
    default: {
      const canvas = material === 'Canvas';
      const suede = material === 'Suede';
      if (canvas) {
        const p = 3.2;
        return {
          period: p,
          slope: 0.22,
          crease: 0,
          bump: (x, y) => Math.sin((x / p) * TAU) * Math.sin((y / p) * TAU),
          dye: (x, y) => 0.96 + 0.08 * hash(x, y, seed),
        };
      }
      return {
        period: 4,
        crease: 0,
        slope: suede ? 0.2 : 0.07,
        bump: (x, y) => vnoise(x / 2.2, y / 2.2, seed) * 2 - 1,
        dye: (x, y) => (suede ? 0.9 + 0.16 * vnoise(x / 3, y / 3, seed + 2) + 0.06 * hash(x, y, seed) : 0.97 + 0.05 * vnoise(x / 5, y / 5, seed + 2)),
      };
    }
  }
}

/* ---------- the bake ---------- */

export function bakeKind(job: BakeJob): BakeResult {
  const { kind, size: n, items } = job;
  const shape = shapes[kind];
  const weave = weaveOf[kind];
  const shoe = shape.profile === 'shoe';
  // Fine relief is lit as if every cloth were the same few millimetres thick,
  // so a heavy coat does not come out looking embossed.
  const T = shoe ? shape.thickness : 0.024;
  const seed = kind.length * 31 + kind.charCodeAt(0);
  const px = 100 / n;

  const [mask, rib, hole] = layers(n, (ctx, ink) => {
    ink(0, 1);
    ctx.fill(new Path2D(shape.body));
    for (const p of shape.details) {
      if (p.rib) {
        ink(1, 1);
        trace(ctx, p);
      }
      if (reliefOf(p) === 'hole') {
        ink(2, 1);
        trace(ctx, p);
      }
    }
  });

  const [seams, proud, inked] = layers(n, (ctx, ink) => {
    for (const p of shape.details) {
      const relief = reliefOf(p);
      if (relief === 'seam') {
        ink(0, Math.min(1, p.opacity * 3.4));
        trace(ctx, { ...p, width: (p.width ?? 1) * 1.2 });
      } else if (relief === 'proud') {
        ink(1, 1);
        trace(ctx, p);
      }
      if (p.tone === 'dark') {
        ink(2, p.opacity);
        trace(ctx, p);
      }
    }
  });

  const [ridges, valleys, fades] = layers(n, (ctx, ink) => {
    for (const f of shape.folds) {
      ink(f.depth > 0 ? 0 : 1, Math.abs(f.depth));
      trace(ctx, { d: f.d, mode: 'stroke', width: f.width, round: true });
    }
    for (const p of shape.details) {
      if (p.tone !== 'light') continue;
      ink(2, p.opacity);
      trace(ctx, p);
    }
  });

  const edge = blur(mask, n, n * 0.009);
  const dome = shoe ? blur(mask, n, n * 0.045) : edge;
  const seamB = blur(seams, n, n * 0.0016);
  const proudB = blur(proud, n, n * 0.0028);
  const holeB = blur(hole, n, n * 0.004);
  const ridgeB = blur(ridges, n, n * 0.012);
  const valleyB = blur(valleys, n, n * 0.012);
  const fadeB = blur(fades, n, n * 0.016);
  const cut = blur(mask, n, 1.1);

  // relief: 1 is the thickness of the piece lying flat
  const h = new Float32Array(n * n);
  const TAU = Math.PI * 2;
  const creasing = thread(weave, n, seed, items[0]?.material ?? '').crease;
  for (let y = 0; y < n; y++) {
    const w = y * px;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (edge[i] < 0.3) continue;
      const u = x * px;
      const fold = (ridgeB[i] - valleyB[i]) * 0.85;
      let v: number;
      if (shoe) {
        const d = smooth(0.5, 1, dome[i]);
        v = Math.pow(d, 0.62) * (1 + fold * 0.14) + proudB[i] * 0.1 - seamB[i] * 0.07 - holeB[i] * 0.62;
      } else {
        const rim = smooth(0.5, 0.96, edge[i]);
        // a hem is cloth turned back on itself: a slight roll just inside the edge
        const hem = smooth(0.5, 0.74, edge[i]) * (1 - smooth(0.74, 0.98, edge[i])) * 0.05;
        const crumple = (vnoise(u * 0.085 + 3, w * 0.03 + 7, seed) - 0.5) * 0.34 + (vnoise(u * 0.19, w * 0.16, seed + 4) - 0.5) * 0.14;
        const crease = (vnoise(u * 0.42 + 9, w * 0.3 + 1, seed + 21) - 0.5) * 0.1 * creasing;
        v = rim + hem + rim * (fold + crumple + crease + proudB[i] * 0.17 - seamB[i] * 0.3 - holeB[i] * 0.6);
        if (rib[i] > 0) v += rim * rib[i] * 0.11 * Math.sin((u / 1.15) * TAU);
      }
      h[i] = v < 0 ? 0 : v;
    }
  }
  const relief = blur(h, n, 1);

  // ---- normal map: the relief, with the weave laid over it
  const kindThread = thread(weave, n, seed, items[0]?.material ?? '');
  const micro = (kindThread.slope * kindThread.period) / (TAU * T * n);
  const H = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const woven = cut[i] > 0.3 && rib[i] < 0.5 && hole[i] < 0.5 ? kindThread.bump(x, y) * micro : 0;
      H[i] = relief[i] + woven;
    }
  }
  const k = T * n * 0.5;
  const normal = new Uint8Array(n * n * 4);
  for (let r = 0; r < n; r++) {
    const y = n - 1 - r;
    const yu = y > 0 ? y - 1 : 0;
    const yd = y < n - 1 ? y + 1 : n - 1;
    for (let x = 0; x < n; x++) {
      const xl = x > 0 ? x - 1 : 0;
      const xr = x < n - 1 ? x + 1 : n - 1;
      const nx = -(H[y * n + xr] - H[y * n + xl]) * k;
      const ny = (H[yd * n + x] - H[yu * n + x]) * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (r * n + x) * 4;
      normal[o] = (nx * inv * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[o + 2] = (inv * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;
    }
  }

  // ---- height for the mesh: only the broad swell, the detail lives in the normals
  const hs = Math.min(HEIGHT_SIZE, n);
  const f = n / hs;
  const coarse = new Float32Array(hs * hs);
  for (let y = 0; y < hs; y++) {
    for (let x = 0; x < hs; x++) {
      let acc = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) acc += relief[(y * f + dy) * n + x * f + dx];
      coarse[y * hs + x] = acc / (f * f);
    }
  }
  const swell = blur(coarse, hs, shoe ? 2 : 3);
  const height = new Uint8Array(hs * hs * 4);
  for (let r = 0; r < hs; r++) {
    for (let x = 0; x < hs; x++) {
      const v = clamp01(swell[(hs - 1 - r) * hs + x] / HEIGHT_RANGE) * 255;
      const o = (r * hs + x) * 4;
      height[o] = height[o + 1] = height[o + 2] = v;
      height[o + 3] = 255;
    }
  }

  // ---- colour, per item
  const paints = shape.details.filter((p) => p.tone === 'paint');
  const albedo = items.map((item) => {
    const base = rgb(item.color);
    const yarn = thread(weave, n, seed + item.id.length * 7, item.material);

    let paintPx: Uint8ClampedArray | null = null;
    if (paints.length) {
      const ctx = makeCtx(n);
      for (const p of paints) {
        const c = resolvePaint(p.color ?? '#000', base, item);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = c;
        ctx.strokeStyle = c;
        trace(ctx, p);
      }
      paintPx = ctx.getImageData(0, 0, n, n).data;
    }

    const data = new Uint8Array(n * n * 4);
    for (let r = 0; r < n; r++) {
      const y = n - 1 - r;
      const w = y * px;
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const o = (r * n + x) * 4;
        let cr = base[0];
        let cg = base[1];
        let cb = base[2];
        if (cut[i] > 0.02) {
          const occ = 0.84 + 0.16 * smooth(0.2, 1, relief[i]);
          const lay = 1 + (ridgeB[i] - valleyB[i]) * 0.12;
          const tone = 0.97 + 0.07 * vnoise(x * px * 0.04, w * 0.04, seed + 11);
          const m = occ * lay * tone * (1 - Math.min(0.92, inked[i] * 0.95)) * (hole[i] > 0.5 ? 1 : yarn.dye(x, y));
          cr *= m;
          cg *= m;
          cb *= m;
          const fd = fadeB[i];
          if (fd > 0.004) {
            // wear takes the dye out and leaves the pale core of the yarn
            cr += (Math.min(1, cr * 2 + 0.07) - cr) * fd;
            cg += (Math.min(1, cg * 2 + 0.075) - cg) * fd;
            cb += (Math.min(1, cb * 1.9 + 0.085) - cb) * fd;
          }
          if (paintPx) {
            const a = paintPx[i * 4 + 3] / 255;
            if (a > 0) {
              const s = 0.86 + 0.14 * occ;
              cr += (LIN[paintPx[i * 4]] * s - cr) * a;
              cg += (LIN[paintPx[i * 4 + 1]] * s - cg) * a;
              cb += (LIN[paintPx[i * 4 + 2]] * s - cb) * a;
            }
          }
        }
        data[o] = SRGB[(clamp01(cr) * 4096) | 0];
        data[o + 1] = SRGB[(clamp01(cg) * 4096) | 0];
        data[o + 2] = SRGB[(clamp01(cb) * 4096) | 0];
        data[o + 3] = cut[i] * 255;
      }
    }
    return { id: item.id, data };
  });

  return { kind, size: n, normal, height, heightSize: hs, albedo };
}
