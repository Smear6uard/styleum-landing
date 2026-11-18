/**
 * Turns baked maps (see bake.ts) into garments on the sheet.
 * The baking runs in a small pool of workers so the page never stalls on it;
 * without workers it falls back to the main thread, one kind per tick.
 */
import * as THREE from 'three';
import { shapes, sizeOf, weaveOf } from '../content/garments';
import type { GarmentKind, Item } from '../content/wardrobe';
import { bakeKind, HEIGHT_RANGE, type BakeJob, type BakeResult } from './bake';

interface KindMaps {
  normalMap: THREE.DataTexture;
  displacementMap: THREE.DataTexture;
}
const kindMaps = new Map<GarmentKind, KindMaps>();
const colourMaps = new Map<string, THREE.DataTexture>();

function texture(data: Uint8Array, n: number, srgb: boolean, aniso: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function accept(r: BakeResult) {
  kindMaps.set(r.kind, {
    normalMap: texture(r.normal, r.size, false, 8),
    displacementMap: texture(r.height, r.heightSize, false, 1),
  });
  for (const a of r.albedo) colourMaps.set(a.id, texture(a.data, r.size, true, 8));
}

function bakeInWorkers(jobs: BakeJob[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const queue = [...jobs];
    let pending = jobs.length;
    const count = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1), jobs.length);
    const workers: Worker[] = [];
    const stop = (err?: unknown) => {
      workers.forEach((w) => w.terminate());
      if (err) reject(err);
      else resolve();
    };
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
      workers.push(w);
      const next = () => {
        const job = queue.shift();
        if (job) w.postMessage(job);
      };
      w.onmessage = (e: MessageEvent<BakeResult>) => {
        accept(e.data);
        if (--pending === 0) stop();
        else next();
      };
      w.onerror = (e) => stop(e);
      next();
    }
  });
}

/** Bake every kind of garment in the wardrobe before the first frame. */
export async function prepareCloth(items: Item[], size: number): Promise<void> {
  const jobs: BakeJob[] = (Object.keys(shapes) as GarmentKind[])
    .map((kind) => ({ kind, size, items: items.filter((i) => i.kind === kind).map((i) => ({ id: i.id, color: i.color, material: i.material })) }))
    .filter((j) => j.items.length > 0);
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('no worker canvas');
    await bakeInWorkers(jobs);
  } catch (err) {
    console.warn('Styleum: baking cloth on the main thread', err);
    for (const job of jobs) {
      if (kindMaps.has(job.kind)) continue;
      accept(bakeKind(job));
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
}

/** Cheap smooth noise for laying each piece down a little differently. */
function wobble(x: number, y: number, seed: number): number {
  return Math.sin(x * 5.1 + seed * 1.7) * Math.cos(y * 4.3 - seed * 2.3) * 0.6 + Math.sin((x + y) * 9.2 + seed * 3.1) * 0.4;
}

/** One garment: a subdivided plane wearing its baked maps. No two pieces lie exactly alike. */
export function createGarment(item: Item, segments: number): THREE.Mesh {
  const maps = kindMaps.get(item.kind)!;
  const shape = shapes[item.kind];
  const shoe = shape.profile === 'shoe';
  const weave = weaveOf[item.kind];

  const geo = new THREE.PlaneGeometry(1, 1, segments, segments);
  if (!shoe) {
    // cloth never lies perfectly true: ease the outline a few millimetres off the drawing
    const seed = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setXY(i, x + wobble(x, y, seed) * 0.011, y + wobble(y + 3, x - 2, seed + 13) * 0.011);
    }
  }

  const suede = item.material === 'Suede';
  const canvas = item.material === 'Canvas';
  const leather = weave === 'leather' && !suede && !canvas;
  const tint = new THREE.Color(item.color);
  const look: Record<string, { roughness: number; sheen: number; sheenRoughness: number }> = {
    jersey: { roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6 },
    poplin: { roughness: 0.82, sheen: 0.25, sheenRoughness: 0.4 },
    knit: { roughness: 1, sheen: 1, sheenRoughness: 0.8 },
    wool: { roughness: 1, sheen: 0.9, sheenRoughness: 0.7 },
    gabardine: { roughness: 0.86, sheen: 0.6, sheenRoughness: 0.45 },
    denim: { roughness: 0.93, sheen: 0.3, sheenRoughness: 0.6 },
    leather: suede ? { roughness: 1, sheen: 1, sheenRoughness: 0.75 } : canvas ? { roughness: 0.95, sheen: 0.3, sheenRoughness: 0.6 } : { roughness: 0.46, sheen: 0, sheenRoughness: 0.5 },
  };
  const l = look[weave];

  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    map: colourMaps.get(item.id)!,
    normalMap: maps.normalMap,
    displacementMap: maps.displacementMap,
    displacementScale: shape.thickness * HEIGHT_RANGE,
    roughness: l.roughness,
    metalness: 0,
    sheen: l.sheen,
    sheenColor: tint.clone().lerp(new THREE.Color('#ffffff'), 0.5),
    sheenRoughness: l.sheenRoughness,
    clearcoat: leather ? 0.25 : 0,
    clearcoatRoughness: 0.4,
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
  mesh.userData.polished = leather;
  return mesh;
}
