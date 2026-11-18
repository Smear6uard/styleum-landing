/**
 * Choreography. Each beat of the story is a layout: where every garment lies,
 * what the camera frames, and where labels pin. The stage eases between them.
 * World space: x right, y up the page, z toward the camera. A garment is 1 unit.
 */
import { items, todaysFour, occasions, forecasts } from '../content/wardrobe';

export type Beat = 'night' | 'looks' | 'wardrobe' | 'forecast' | 'wear' | 'styleme' | 'tomorrow';
export const beats: Beat[] = ['night', 'looks', 'wardrobe', 'forecast', 'wear', 'styleme'];

export interface Pose {
  x: number;
  y: number;
  /** stacking level, 0 is on the sheet */
  l: number;
  /** rotation about z, radians */
  r: number;
  s: number;
}

export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** camera tilt away from straight down, radians */
  tilt: number;
}

export interface Layout {
  poses: Record<string, Pose>;
  phone: Pose | null;
  frame: Frame;
  anchors: Record<string, { x: number; y: number }>;
}

export interface StoryState {
  beat: Beat;
  forecast: 'clear' | 'rain' | 'cold';
  occasion: string;
  pick: number;
}

const ids = items.map((i) => i.id);
const kindOf = Object.fromEntries(items.map((i) => [i.id, i.kind]));
const isShoe = (id: string) => kindOf[id] === 'sneaker' || kindOf[id] === 'loafer';
const isLeg = (id: string) => kindOf[id] === 'trousers' || kindOf[id] === 'jeans';

/** Deterministic scatter so the pile is the same pile on every visit. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** One outfit as a flat-lay: layer and top up high, trousers below, shoes at the hem. */
function look(out: Record<string, Pose>, itemIds: readonly string[], cx: number, cy: number, k: number) {
  const [top, layerId, bottom, shoes] = itemIds;
  out[bottom] = { x: cx - 0.1 * k, y: cy - 0.52 * k, l: 0, r: 0.03, s: k };
  out[layerId] = { x: cx - 0.17 * k, y: cy + 0.5 * k, l: 1, r: 0.09, s: k };
  out[top] = { x: cx + 0.27 * k, y: cy + 0.46 * k, l: 2, r: -0.08, s: k };
  out[shoes] = { x: cx + 0.46 * k, y: cy - 0.84 * k, l: 2, r: -0.12, s: k };
}

/** Everything not on stage waits off the edge of the sheet, left or right. */
function park(out: Record<string, Pose>, portrait: boolean) {
  let n = 0;
  for (const id of ids) {
    if (out[id]) continue;
    const side = n % 2 === 0 ? -1 : 1;
    const row = Math.floor(n / 2);
    out[id] = portrait
      ? { x: side * 7.5, y: 2.4 - row * 0.8, l: n % 4, r: side * 0.5, s: 1 }
      : { x: side * 12, y: 2 - row * 0.7, l: n % 4, r: side * 0.5, s: 1 };
    n++;
  }
}

function night(portrait: boolean): Layout {
  const poses: Record<string, Pose> = {};
  const rand = rng(41);
  const rx = portrait ? 1.2 : 2.05;
  const ry = portrait ? 1.75 : 1.25;
  ids.forEach((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const d = 0.56 + rand() * 0.5;
    poses[id] = {
      x: Math.cos(a) * rx * d,
      y: Math.sin(a) * ry * d + 0.1,
      // shoes sit on top of the pile: nothing soft should cut through a sole
      l: isShoe(id) ? 5 + (i % 2) : i % 5,
      r: (rand() - 0.5) * 2.6,
      s: 0.98 + rand() * 0.1,
    };
  });
  return {
    poses,
    phone: { x: 0, y: 0, l: 7, r: -0.2, s: 1 },
    frame: portrait ? { cx: 0, cy: -0.02, w: 1.25, h: 1.55, tilt: 0.42 } : { cx: 0, cy: 0.02, w: 2.4, h: 1.7, tilt: 0.5 },
    anchors: {},
  };
}

function looks(portrait: boolean): Layout {
  const poses: Record<string, Pose> = {};
  const anchors: Layout['anchors'] = {};
  todaysFour.forEach((o, i) => {
    let cx: number;
    let cy: number;
    if (portrait) {
      cx = (i % 2 === 0 ? -1 : 1) * 0.82;
      cy = i < 2 ? 1.3 : -1.3;
    } else {
      cx = (i - 1.5) * 1.5;
      cy = 0.12;
    }
    look(poses, o.itemIds, cx, cy, 1);
    anchors[`look-${i}`] = { x: cx, y: cy - 1.28 };
  });
  park(poses, portrait);
  return {
    poses,
    phone: null,
    frame: portrait ? { cx: 0, cy: -0.12, w: 3.4, h: 5.5, tilt: 0.1 } : { cx: 0.04, cy: -0.14, w: 5.95, h: 2.85, tilt: 0.14 },
    anchors,
  };
}

function wardrobe(portrait: boolean): Layout {
  const poses: Record<string, Pose> = {};
  const anchors: Layout['anchors'] = {};
  const order = [...ids].sort((a, b) => {
    const rank = (id: string) => (isShoe(id) ? 3 : isLeg(id) ? 2 : kindOf[id] === 'tee' || kindOf[id] === 'shirt' || kindOf[id] === 'knit' ? 0 : 1);
    return rank(a) - rank(b);
  });
  const cols = 4;
  const gapX = 1.14;
  const gapY = 1.3;
  order.forEach((id, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = (c - (cols - 1) / 2) * gapX;
    const y = (1.5 - r) * gapY + 0.1;
    poses[id] = { x, y, l: 0, r: 0, s: isShoe(id) ? 1.25 : 0.86 };
    anchors[`item-${id}`] = { x, y: y - (isShoe(id) ? 0.4 : 0.58) };
  });
  return {
    poses,
    phone: null,
    frame: portrait ? { cx: 0, cy: 0, w: 4.5, h: 5.2, tilt: 0.06 } : { cx: 0, cy: 0, w: 4.5, h: 5.4, tilt: 0.1 },
    anchors,
  };
}

function forecast(portrait: boolean, id: StoryState['forecast']): Layout {
  const poses: Record<string, Pose> = {};
  const f = forecasts.find((x) => x.id === id) ?? forecasts[0];
  look(poses, f.itemIds, f.extraId ? 0.42 : 0, 0, 1.18);
  if (f.extraId) poses[f.extraId] = { x: -0.8, y: 0.3, l: 0, r: 0.2, s: 1.18 };
  park(poses, portrait);
  return {
    poses,
    phone: null,
    frame: f.extraId
      ? { cx: -0.1, cy: 0, w: 3.1, h: 2.95, tilt: portrait ? 0.14 : 0.2 }
      : { cx: 0, cy: 0, w: 2.15, h: 2.95, tilt: portrait ? 0.14 : 0.2 },
    anchors: {},
  };
}

function wear(portrait: boolean, pick: number): Layout {
  const poses: Record<string, Pose> = {};
  const anchors: Layout['anchors'] = {};
  const rest = todaysFour.map((_, i) => i).filter((i) => i !== pick);
  if (portrait) {
    look(poses, todaysFour[pick].itemIds, 0, 0.75, 1.1);
    rest.forEach((i, n) => look(poses, todaysFour[i].itemIds, (n - 1) * 1.02, -1.5, 0.52));
  } else {
    look(poses, todaysFour[pick].itemIds, -0.75, 0, 1.2);
    rest.forEach((i, n) => look(poses, todaysFour[i].itemIds, 1.25, (1 - n) * 0.98, 0.44));
  }
  // the chosen look sits a little proud of the sheet
  for (const id of todaysFour[pick].itemIds) poses[id].l += 3;
  park(poses, portrait);
  return {
    poses,
    phone: null,
    frame: portrait ? { cx: 0, cy: -0.15, w: 3.1, h: 4.4, tilt: 0.12 } : { cx: 0.1, cy: 0, w: 3.6, h: 3, tilt: 0.2 },
    anchors,
  };
}

function styleme(portrait: boolean, occasion: string): Layout {
  const poses: Record<string, Pose> = {};
  const o = occasions.find((x) => x.id === occasion) ?? occasions[0];
  const restIds = ids.filter((id) => !o.itemIds.includes(id));
  if (portrait) {
    look(poses, o.itemIds, 0, -0.35, 1.12);
    // the rest of the closet waits in two tidy rows above
    restIds.forEach((id, i) => {
      const c = i % 6;
      const r = Math.floor(i / 6);
      poses[id] = { x: (c - 2.5) * 0.5, y: 2.05 - r * 0.56, l: 0, r: 0, s: isShoe(id) ? 0.6 : 0.4 };
    });
  } else {
    look(poses, o.itemIds, -0.7, 0, 1.2);
    restIds.forEach((id, i) => {
      const c = i % 3;
      const r = Math.floor(i / 3);
      poses[id] = { x: 0.95 + c * 0.6, y: 0.95 - r * 0.63, l: 0, r: 0, s: isShoe(id) ? 0.7 : 0.46 };
    });
  }
  return {
    poses,
    phone: null,
    frame: portrait ? { cx: 0, cy: 0.35, w: 3.1, h: 4.1, tilt: 0.12 } : { cx: 0.42, cy: 0, w: 3.9, h: 3, tilt: 0.2 },
    anchors: {},
  };
}

/** The closing shot: tomorrow's look already laid out, the phone waiting beside it. */
function tomorrow(portrait: boolean): Layout {
  const poses: Record<string, Pose> = {};
  look(poses, todaysFour[1].itemIds, portrait ? -0.22 : -0.3, 0, 1.12);
  park(poses, portrait);
  return {
    poses,
    phone: { x: portrait ? 0.74 : 0.82, y: portrait ? 0.72 : 0.5, l: 3, r: 0.16, s: 0.92 },
    frame: portrait ? { cx: 0.08, cy: 0, w: 2.3, h: 2.75, tilt: 0.3 } : { cx: 0.12, cy: 0, w: 2.6, h: 2.7, tilt: 0.4 },
    anchors: {},
  };
}

export function layoutFor(state: StoryState, portrait: boolean): Layout {
  switch (state.beat) {
    case 'night':
      return night(portrait);
    case 'looks':
      return looks(portrait);
    case 'wardrobe':
      return wardrobe(portrait);
    case 'forecast':
      return forecast(portrait, state.forecast);
    case 'wear':
      return wear(portrait, state.pick);
    case 'styleme':
      return styleme(portrait, state.occasion);
    case 'tomorrow':
      return tomorrow(portrait);
  }
}
