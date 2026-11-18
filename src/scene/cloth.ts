/**
 * Turns the flat garment drawings into pieces of cloth.
 * Each kind is baked once into three maps (colour + cutout, relief normals,
 * height) so a plain subdivided plane reads as a padded, stitched garment
 * under raking light. No models, no image files.
 */
import * as THREE from 'three';
import { shapes, sizeOf, weaveOf, type Weave } from '../content/garments';
import type { GarmentKind, Item } from '../content/wardrobe';

export interface ClothMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  displacementMap: THREE.CanvasTexture;
}

/** Relief height of a garment, in world units (a garment is 1 unit wide). */
export const PUFF = 0.046;
/** Albedo of plain cloth in the baked map, leaving headroom for light stitching. */
const BASE = 0.86;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Three box blurs approximate a gaussian. */
export function blur(src: Float32Array, n: number, radius: number): Float32Array {
  let a = src;
  let b = new Float32Array(n * n);
  const r = Math.max(1, Math.round(radius));
  const w = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    // horizontal
    for (let y = 0; y < n; y++) {
      const row = y * n;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(n - 1, Math.max(0, x))];
      for (let x = 0; x < n; x++) {
        b[row + x] = acc / w;
        acc += a[row + Math.min(n - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    // vertical
    const c = pass === 0 ? new Float32Array(n * n) : a;
    for (let x = 0; x < n; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(n - 1, Math.max(0, y)) * n + x];
      for (let y = 0; y < n; y++) {
        c[y * n + x] = acc / w;
        acc += b[Math.min(n - 1, y + r + 1) * n + x] - b[Math.max(0, y - r) * n + x];
      }
    }
    a = c;
  }
  return a;
}

/** Cheap value noise for creases. */
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}

function layer(n: number, draw: (ctx: CanvasRenderingContext2D) => void): Float32Array {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(n / 100, n / 100);
  draw(ctx);
  const px = ctx.getImageData(0, 0, n, n).data;
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] / 255;
  return out;
}

function toTexture(n: number, fill: (data: Uint8ClampedArray) => void, srgb: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function bake(kind: GarmentKind, n: number): ClothMaps {
  const shape = shapes[kind];
  const weave: Weave = weaveOf[kind];
  const seed = kind.length * 3.1 + kind.charCodeAt(0);
  const body = new Path2D(shape.body);

  const mask = layer(n, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fill(body);
  });

  // Seams sink, panels and buttons sit proud, light stitching only changes colour.
  const grooves = layer(n, (ctx) => {
    ctx.strokeStyle = '#000';
    for (const p of shape.details) {
      if (p.mode !== 'stroke' || !p.d) continue;
      ctx.globalAlpha = Math.min(1, p.opacity * 3);
      ctx.lineWidth = (p.width ?? 1.6) * 1.15;
      ctx.lineCap = p.round ? 'round' : 'butt';
      ctx.lineJoin = 'round';
      ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []);
      ctx.stroke(new Path2D(p.d));
    }
  });
  const raised = layer(n, (ctx) => {
    ctx.fillStyle = '#000';
    for (const p of shape.details) {
      if (p.mode !== 'fill') continue;
      ctx.globalAlpha = 1;
      if (p.c) {
        ctx.beginPath();
        ctx.arc(p.c[0], p.c[1], p.c[2] * 1.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.d) ctx.fill(new Path2D(p.d));
    }
  });
  const ink = layer(n, (ctx) => {
    for (const p of shape.details) {
      if (p.tone !== 'dark') continue;
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = ctx.strokeStyle = '#000';
      if (p.c) {
        ctx.beginPath();
        ctx.arc(p.c[0], p.c[1], p.c[2], 0, Math.PI * 2);
        ctx.fill();
      } else if (p.mode === 'fill' && p.d) ctx.fill(new Path2D(p.d));
      else if (p.d) {
        ctx.lineWidth = p.width ?? 1.6;
        ctx.lineCap = p.round ? 'round' : 'butt';
        ctx.lineJoin = 'round';
        ctx.setLineDash(p.dash ? p.dash.split(' ').map(Number) : []);
        ctx.stroke(new Path2D(p.d));
      }
    }
  });
  const thread = layer(n, (ctx) => {
    ctx.strokeStyle = '#000';
    for (const p of shape.details) {
      if (p.tone !== 'light' || !p.d) continue;
      ctx.globalAlpha = Math.min(1, p.opacity * 2.4);
      ctx.lineWidth = p.width ?? 1.2;
      ctx.lineCap = 'round';
      ctx.setLineDash([1.6, 1.3]);
      ctx.stroke(new Path2D(p.d));
    }
  });

  const edge = blur(mask, n, n * 0.013);
  const dome = blur(mask, n, n * 0.06);
  const groove = blur(grooves, n, n * 0.004);
  const proud = blur(raised, n, n * 0.006);
  const leather = weave === 'leather';

  const h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (mask[i] < 0.02 && edge[i] < 0.3) continue;
      const rim = smooth(0.5, 0.98, edge[i]);
      const belly = smooth(0.5, 1, dome[i]);
      let v = (1 - (1 - rim) * (1 - rim)) * 0.72 + belly * 0.28;

      const u = (x / n) * 100;
      const w = (y / n) * 100;
      if (!leather) {
        // cloth drapes in long folds down its length, with a little crumple across
        const fold = noise2(u * 0.085 + 3, w * 0.024 + 7, seed);
        const crease = 1 - Math.abs(noise2(u * 0.06 + w * 0.05, w * 0.11 - u * 0.03, seed + 9) * 2 - 1);
        v += ((fold - 0.5) * 0.22 + (crease - 0.6) * 0.1) * rim;
      }
      // the weave itself, fine enough to melt away at a distance
      if (weave === 'plain') v += Math.sin(u * 4.4) * Math.sin(w * 4.4) * 0.016 * rim;
      if (weave === 'rib') v += (Math.sin(u * 2.9) * 0.034 + Math.sin(w * 5.2) * 0.006) * rim;
      if (weave === 'twill') v += Math.sin((u + w) * 3.9) * 0.012 * rim;

      v -= groove[i] * 0.3;
      v += proud[i] * 0.14 * rim;
      h[i] = Math.min(1, Math.max(0, v));
    }
  }
  const height = blur(h, n, 1);

  const k = PUFF * n * 0.9;
  const at = (x: number, y: number) => height[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];

  const normalMap = toTexture(
    n,
    (d) => {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * k;
          const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * k;
          // canvas y runs down, texture v runs up
          const nx = -dx;
          const ny = dy;
          const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          const o = (y * n + x) * 4;
          d[o] = (nx * inv * 0.5 + 0.5) * 255;
          d[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
          d[o + 2] = (inv * 0.5 + 0.5) * 255;
          d[o + 3] = 255;
        }
      }
    },
    false,
  );

  // The mesh only carries the broad swell; the fine relief lives in the normal map.
  // Displacing by the sharp rim would zigzag along every diagonal seam.
  const swell = blur(height, n, n * 0.03);
  const displacementMap = toTexture(
    n,
    (d) => {
      for (let i = 0; i < n * n; i++) {
        const v = swell[i] * 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
    },
    false,
  );

  // a slightly softened cutout keeps the silhouette smooth when the cloth fills the screen
  const cut = blur(mask, n, 1.2);
  const map = toTexture(
    n,
    (d) => {
      for (let i = 0; i < n * n; i++) {
        // soft occlusion in the valleys, ink for seams, a lift for stitching
        const occl = 0.8 + 0.2 * smooth(0.15, 0.75, height[i]);
        // heathered yarn: no two threads take dye quite alike
        const grain = leather ? 1 : 0.955 + 0.09 * noise2((i % n) * 0.9, Math.floor(i / n) * 0.9, seed + 3);
        let v = BASE * occl * grain * (1 - ink[i] * 0.9);
        v += thread[i] * (1 - v) * 0.9;
        const s = Math.pow(Math.min(1, v), 1 / 2.2) * 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = s;
        d[i * 4 + 3] = cut[i] * 255;
      }
    },
    true,
  );

  return { map, normalMap, displacementMap };
}

const cache = new Map<GarmentKind, ClothMaps>();
export function clothMaps(kind: GarmentKind, size: number): ClothMaps {
  let maps = cache.get(kind);
  if (!maps) {
    maps = bake(kind, size);
    cache.set(kind, maps);
  }
  return maps;
}

/** Bake every kind ahead of time, one per frame, so the page never stalls on it. */
export async function prepareCloth(size: number): Promise<void> {
  for (const kind of Object.keys(shapes) as GarmentKind[]) {
    clothMaps(kind, size);
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

const plane = new Map<number, THREE.PlaneGeometry>();

/** One garment: a subdivided plane wearing its baked maps, tinted to the item's colour. */
export function createGarment(item: Item, quality: { texture: number; segments: number }): THREE.Mesh {
  const maps = clothMaps(item.kind, quality.texture);
  let geo = plane.get(quality.segments);
  if (!geo) {
    geo = new THREE.PlaneGeometry(1, 1, quality.segments, quality.segments);
    plane.set(quality.segments, geo);
  }
  const weave = weaveOf[item.kind];
  const leather = weave === 'leather' && item.material !== 'Suede' && item.material !== 'Canvas';
  const tint = new THREE.Color(item.color);
  const color = tint.clone().multiplyScalar(1 / BASE);
  const sheen = tint.clone().lerp(new THREE.Color('#ffffff'), 0.55);

  const mat = new THREE.MeshPhysicalMaterial({
    color,
    map: maps.map,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    displacementMap: maps.displacementMap,
    displacementScale: PUFF,
    roughness: leather ? 0.42 : 0.94,
    metalness: 0,
    sheen: leather ? 0 : 0.9,
    sheenColor: sheen,
    sheenRoughness: 0.55,
    alphaTest: 0.5,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = item.id;
  mesh.userData.size = sizeOf[item.kind];
  return mesh;
}
