/**
 * The stage: one sheet, sixteen garments, a phone, and the 9:00 sun.
 * It owns the renderer and eases everything toward the current layout.
 * Nothing here knows about scroll; scripts/motion.ts drives it through the API.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { items } from '../content/wardrobe';
import { blur } from './bake';
import { createGarment, prepareCloth } from './cloth';
import { createPhone } from './phone';
import { layoutFor, type Layout, type Pose, type StoryState } from './layouts';

export interface Safe {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Stage {
  set(next: Partial<StoryState>): void;
  /** 0 = night, 1 = full morning */
  setTime(t: number): void;
  /** 0..1 through the story; slides the sun and the window shadows */
  setDrift(p: number): void;
  /** Parts of the canvas the scene may sit in, as fractions. Given several, each layout takes the roomiest. */
  setSafe(s: Safe | Safe[]): void;
  /** Scroll velocity in px/s, for a little wind */
  kick(v: number): void;
  /** Light the phone. 1 is the 9:00 notification; about 0.44 is a bare lock screen. */
  wakePhone(level?: number, clock?: string): void;
  setRunning(on: boolean): void;
  resize(): void;
  readonly state: StoryState;
}

interface Actor {
  mesh: THREE.Object3D;
  x: number;
  y: number;
  r: number;
  s: number;
  level: number;
  lift: number;
  hover: number;
  target: Pose;
  delay: number;
  pending: Pose | null;
  phase: number;
  vx: number;
  vy: number;
}

const FOV = 27;
const LEVEL = 0.028;
const BASE_Z = 0.008;
const TAU = Math.PI * 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const C = {
  nightSky: new THREE.Color('#05060a'),
  daySky: new THREE.Color('#eceae3'),
  sunLow: new THREE.Color('#ff7a3c'),
  sunDawn: new THREE.Color('#ffab6e'),
  sunHigh: new THREE.Color('#fff5e8'),
  sunCold: new THREE.Color('#e6efff'),
  hemiNightSky: new THREE.Color('#27336b'),
  hemiDaySky: new THREE.Color('#e9eef6'),
  hemiRainSky: new THREE.Color('#c3ccd9'),
  hemiColdSky: new THREE.Color('#c9dcff'),
  hemiNightGround: new THREE.Color('#06070c'),
  hemiDayGround: new THREE.Color('#f1e9dc'),
};

/** Window light as a texture: bright panes, soft mullions, a little leaf shade in one corner. */
function windowCookie(): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  // shade is painted as alpha, then softened
  ctx.fillStyle = '#000';
  const bar = (x: number, y: number, w: number, h: number) => ctx.fillRect(x * n, y * n, w * n, h * n);
  for (let i = 0; i < 5; i++) bar(0, 0.09 + i * 0.2, 1, 0.02);
  bar(0.3, 0, 0.014, 1);
  bar(0.74, 0, 0.014, 1);
  const read = () => {
    const px = ctx.getImageData(0, 0, n, n).data;
    const out = new Float32Array(n * n);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] / 255;
    return out;
  };
  const frame = blur(read(), n, 5);

  // a branch outside the window: big, very soft, only a hint
  ctx.clearRect(0, 0, n, n);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.pow(rand(), 0.6) * 0.36;
    ctx.beginPath();
    ctx.ellipse((0.2 + Math.cos(a) * d) * n, (0.16 + Math.sin(a) * d * 0.8) * n, (0.03 + rand() * 0.05) * n, (0.014 + rand() * 0.02) * n, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const leaves = blur(read(), n, 11);

  const img = ctx.createImageData(n, n);
  for (let i = 0; i < frame.length; i++) {
    const shade = Math.min(1, frame[i] * 0.6 + leaves[i] * 0.3);
    const v = (1 - shade) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createStage(canvas: HTMLCanvasElement, opts: { reduced: boolean; labels?: HTMLElement | null }): Promise<Stage> {
  const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  const quality = coarse ? { texture: 512, segments: 56, shadow: 1024, dpr: 1.75 } : { texture: 768, segments: 80, shadow: 2048, dpr: 2 };
  await prepareCloth(items, quality.texture);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = C.nightSky.clone();
  scene.fog = new THREE.Fog(C.nightSky.clone(), 9, 26);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.up.set(0, 1, 0);

  // The sheet
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: '#f1efe8', roughness: 1, metalness: 0 }),
  );
  sheet.receiveShadow = true;
  scene.add(sheet);

  // Light
  const hemi = new THREE.HemisphereLight(C.hemiNightSky.clone(), C.hemiNightGround.clone(), 0.2);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight('#8195d8', 0.4);
  moon.position.set(4, 3, 6);
  scene.add(moon);

  // The sun comes through a window: a spot far away, wearing a soft cookie
  // of mullions and leaf shade, so the light on the sheet has a shape.
  const SUN_DIST = 32;
  const sun = new THREE.SpotLight('#fff4e6', 0, 0, 0.25, 0.4, 0);
  sun.map = windowCookie();
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 4;
  sun.shadow.camera.near = 14;
  sun.shadow.camera.far = 52;
  scene.add(sun, sun.target);

  // Cast
  const actors = new Map<string, Actor>();
  const makeActor = (mesh: THREE.Object3D, i: number): Actor => ({
    mesh,
    x: 0,
    y: 0,
    r: 0,
    s: 1,
    level: 0,
    lift: 0,
    hover: 0,
    target: { x: 0, y: 0, l: 0, r: 0, s: 1 },
    delay: 0,
    pending: null,
    phase: (i * 0.618) % 1,
    vx: 0,
    vy: 0,
  });
  // Polished leather needs a room to reflect, or it reads as black plastic.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const polished: THREE.MeshPhysicalMaterial[] = [];
  items.forEach((item, i) => {
    const mesh = createGarment(item, quality.segments);
    if (mesh.userData.polished) {
      const m = mesh.material as THREE.MeshPhysicalMaterial;
      m.envMap = room;
      polished.push(m);
    }
    scene.add(mesh);
    actors.set(item.id, makeActor(mesh, i));
  });
  const phone = createPhone();
  scene.add(phone.group);
  const phoneActor = makeActor(phone.group, 99);
  const PHONE_AWAY: Pose = { x: 5, y: 9, l: 7, r: 0.5, s: 1 };

  // State
  const state: StoryState = { beat: 'night', forecast: 'clear', occasion: 'date', pick: 0 };
  let portrait = false;
  let layout: Layout = layoutFor(state, portrait);
  let safes: Safe[] = [{ l: 0, t: 0, r: 1, b: 1 }];
  let time = 0;
  let timeNow = 0;
  let drift = 0;
  let driftNow = 0;
  let wind = 0;
  let wakeTarget = 0;
  let width = 1;
  let height = 1;
  let running = true;
  let awakeUntil = 0;
  let raf = 0;
  let last = performance.now();
  let first = true;

  const cam = { cx: 0, cy: 0, dist: 8, tilt: 0.4, ox: 0, oy: 0 };
  const camTarget = { ...cam };
  const light = { rain: 0, cold: 0, dawn: 0 };
  const pointer = { x: 0, y: 0, px: -9999, py: -9999, active: false };

  const poke = (ms = 2600) => {
    awakeUntil = performance.now() + ms;
    if (!raf && running) raf = requestAnimationFrame(frame);
  };

  /** How tall the view must be (in world units) to show a frame in the roomiest safe area. */
  function fit(f: Layout['frame']): { visH: number; safe: Safe } {
    const aspect = width / height;
    let best = { visH: Infinity, safe: safes[0] };
    for (const c of safes) {
      const v = Math.max(f.h / Math.max(0.15, c.b - c.t), f.w / (Math.max(0.15, c.r - c.l) * aspect));
      if (v < best.visH) best = { visH: v, safe: c };
    }
    return best;
  }

  function chooseLayout(): Layout {
    // The opening and closing shots follow the screen's shape. Every other beat has a wide
    // and a tall arrangement, and takes whichever shows the clothes larger in the room it has.
    if (state.beat === 'night' || state.beat === 'tomorrow') return layoutFor(state, portrait);
    const wide = layoutFor(state, false);
    const tall = layoutFor(state, true);
    return fit(tall.frame).visH < fit(wide.frame).visH ? tall : wide;
  }

  function applyLayout(instant: boolean) {
    layout = chooseLayout();
    const order = [...actors.entries()];
    // pieces already near their place go first, so the motion reads as sorting
    order.sort(([a, A], [b, B]) => {
      const pa = layout.poses[a];
      const pb = layout.poses[b];
      return Math.hypot(pa.x - A.x, pa.y - A.y) - Math.hypot(pb.x - B.x, pb.y - B.y);
    });
    order.forEach(([id, a], i) => {
      const pose = layout.poses[id];
      if (instant) {
        a.target = pose;
        a.pending = null;
        Object.assign(a, { x: pose.x, y: pose.y, r: pose.r, s: pose.s, level: pose.l, lift: 0 });
      } else {
        a.pending = pose;
        a.delay = i * 0.032;
      }
    });
    const pp = layout.phone ?? PHONE_AWAY;
    if (instant) {
      phoneActor.target = pp;
      Object.assign(phoneActor, { x: pp.x, y: pp.y, r: pp.r, s: pp.s, level: pp.l, lift: 0 });
    } else {
      phoneActor.pending = pp;
      phoneActor.delay = layout.phone ? 0.25 : 0;
    }
    fitCamera();
    if (instant) Object.assign(cam, camTarget);
    updateAnchors(true);
  }

  function fitCamera() {
    const f = layout.frame;
    const { visH, safe } = fit(f);
    camTarget.dist = (visH / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2))) * (1 + f.tilt * 0.22);
    camTarget.cx = f.cx;
    camTarget.cy = f.cy;
    camTarget.tilt = f.tilt;
    camTarget.ox = 0.5 - (safe.l + safe.r) / 2;
    camTarget.oy = 0.5 - (safe.t + safe.b) / 2;
  }

  // Labels pinned to places on the sheet
  const labelEls = opts.labels ? Array.from(opts.labels.querySelectorAll<HTMLElement>('[data-anchor]')) : [];
  const v3 = new THREE.Vector3();
  function updateAnchors(toggle = false) {
    for (const el of labelEls) {
      const a = layout.anchors[el.dataset.anchor!];
      if (toggle) el.classList.toggle('is-on', !!a);
      if (!a) continue;
      v3.set(a.x, a.y, 0).project(camera);
      const x = (v3.x * 0.5 + 0.5) * width;
      const y = (-v3.y * 0.5 + 0.5) * height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  function step(a: Actor, dt: number, t: number, isPhone: boolean) {
    if (a.pending) {
      a.delay -= dt;
      if (a.delay <= 0) {
        a.target = a.pending;
        a.pending = null;
      }
    }
    const tg = a.target;
    const k = 1 - Math.exp(-dt * 4.4);
    const px = a.x;
    const py = a.y;
    a.x += (tg.x - a.x) * k;
    a.y += (tg.y - a.y) * k;
    a.r += (tg.r - a.r) * k;
    a.s += (tg.s - a.s) * k;
    a.level += (tg.l - a.level) * k;
    const remaining = Math.hypot(tg.x - a.x, tg.y - a.y);
    const liftTarget = Math.min(1.1, remaining * 0.24) + (a.pending ? 0.05 : 0);
    a.lift += (liftTarget - a.lift) * (1 - Math.exp(-dt * 7));
    const ivx = dt > 0 ? (a.x - px) / dt : 0;
    const ivy = dt > 0 ? (a.y - py) / dt : 0;
    a.vx += (ivx - a.vx) * 0.2;
    a.vy += (ivy - a.vy) * 0.2;

    // pointer: nearby cloth lifts off the sheet
    let hoverTarget = 0;
    if (pointer.active && !isPhone) {
      v3.set(a.x, a.y, 0).project(camera);
      const sx = (v3.x * 0.5 + 0.5) * width;
      const sy = (-v3.y * 0.5 + 0.5) * height;
      const d = Math.hypot(sx - pointer.px, sy - pointer.py);
      hoverTarget = 1 - smooth(40, 210, d);
    }
    a.hover += (hoverTarget - a.hover) * (1 - Math.exp(-dt * 6));

    const sway = Math.sin(t * 0.6 + a.phase * TAU);
    const gust = wind * (0.6 + a.phase * 0.8);
    const m = a.mesh;
    m.position.set(a.x, a.y, BASE_Z + a.level * LEVEL + a.lift + a.hover * 0.09 + Math.abs(gust) * 0.05);
    m.rotation.set(
      THREE.MathUtils.clamp(-a.vy * 0.05, -0.5, 0.5) + a.hover * 0.06 * sway,
      THREE.MathUtils.clamp(a.vx * 0.05, -0.5, 0.5) + gust * 0.05,
      a.r + gust * 0.03 * (a.phase - 0.5) + a.hover * 0.025 * sway,
    );
    m.scale.setScalar(a.s * (m.userData.size ?? 1));
    return remaining + Math.abs(tg.r - a.r) + a.lift + a.hover + Math.abs(wind);
  }

  const sunDir = new THREE.Vector3();
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const instant = opts.reduced || first;
    const ease = (rate: number) => (instant ? 1 : 1 - Math.exp(-dt * rate));

    // the sun takes its time coming up, and a little less going down
    timeNow += (time - timeNow) * ease(time > timeNow ? 1.5 : 2.4);
    driftNow += (drift - driftNow) * ease(4);
    wind += (0 - wind) * (1 - Math.exp(-dt * 3.2));

    // actors
    let motion = 0;
    for (const a of actors.values()) motion += step(a, instant ? 1 : dt, t, false);
    motion += step(phoneActor, instant ? 1 : dt, t, true);

    // phone wakes
    if (phone.wake !== wakeTarget) {
      const next = instant ? wakeTarget : phone.wake + Math.sign(wakeTarget - phone.wake) * dt * 0.75;
      phone.setWake(wakeTarget > phone.wake ? Math.min(wakeTarget, next) : Math.max(wakeTarget, next));
      motion += 1;
    }

    // camera
    const ck = ease(3.2);
    cam.cx += (camTarget.cx - cam.cx) * ck;
    cam.cy += (camTarget.cy - cam.cy) * ck;
    cam.dist += (camTarget.dist - cam.dist) * ck;
    cam.tilt += (camTarget.tilt - cam.tilt) * ck;
    cam.ox += (camTarget.ox - cam.ox) * ck;
    cam.oy += (camTarget.oy - cam.oy) * ck;
    motion += Math.abs(camTarget.dist - cam.dist) + Math.abs(camTarget.cx - cam.cx) + Math.abs(camTarget.cy - cam.cy);
    pointer.x += ((pointer.active ? (pointer.px / width) * 2 - 1 : 0) - pointer.x) * ease(2.5);
    pointer.y += ((pointer.active ? (pointer.py / height) * 2 - 1 : 0) - pointer.y) * ease(2.5);
    const tilt = cam.tilt + pointer.y * 0.035;
    const pan = pointer.x * 0.05 * cam.dist * 0.1;
    camera.position.set(cam.cx + pan * 2.2, cam.cy - Math.sin(tilt) * cam.dist, Math.cos(tilt) * cam.dist);
    camera.lookAt(cam.cx + pan, cam.cy, 0);
    camera.setViewOffset(width, height, cam.ox * width, cam.oy * height, width, height);

    // light
    const day = timeNow;
    const inForecast = state.beat === 'forecast';
    const rainT = inForecast && state.forecast === 'rain' ? 1 : 0;
    const coldT = inForecast && state.forecast === 'cold' ? 1 : 0;
    light.rain += (rainT - light.rain) * ease(2.6);
    light.cold += (coldT - light.cold) * ease(2.6);
    // the closing shot: still night, but the first low light is already across the sheet
    const dawnT = state.beat === 'tomorrow' ? 1 : 0;
    light.dawn += (dawnT - light.dawn) * ease(2.2);
    motion += Math.abs(dawnT - light.dawn);
    motion += Math.abs(rainT - light.rain) + Math.abs(coldT - light.cold) + Math.abs(time - timeNow) + Math.abs(drift - driftNow);

    const rise = smooth(0.02, 1, day);
    const elevation = THREE.MathUtils.degToRad(lerp(lerp(lerp(2.5, 37, rise), 17, light.cold), 9, light.dawn));
    const azimuth = THREE.MathUtils.degToRad(132 - driftNow * 26);
    sunDir.set(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation));
    // the window always spans what the camera sees, so its panes keep their scale on screen
    const visH = 2 * cam.dist * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const visW = visH * (width / height);
    const reach = 0.5 * Math.hypot(visW, visH) * 1.12;
    sun.angle = Math.atan((reach * 1.3) / SUN_DIST);
    sun.target.position.set(cam.cx + cam.ox * visW, cam.cy - cam.oy * visH, 0);
    // and slides across the sheet as the morning goes on
    const slide = (driftNow * 0.5 + Math.sin(t * 0.21) * 0.012) * reach;
    sun.target.position.x += slide * 0.35;
    sun.target.position.y -= slide;
    (scene.fog as THREE.Fog).near = cam.dist * 1.5;
    (scene.fog as THREE.Fog).far = cam.dist * 3.4;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, SUN_DIST);
    sun.intensity = lerp(smooth(0.04, 0.85, day) * lerp(lerp(4.3, 0.3, light.rain), 3.8, light.cold), 2.1, light.dawn);
    sun.color.copy(tmpA.copy(C.sunLow).lerp(C.sunHigh, Math.pow(day, 0.6))).lerp(C.sunCold, light.cold).lerp(C.sunDawn, light.dawn);

    hemi.intensity = lerp(lerp(0.1, 1.3, day), 2.1, light.rain * day);
    hemi.color.copy(tmpA.copy(C.hemiNightSky).lerp(C.hemiDaySky, day)).lerp(C.hemiRainSky, light.rain).lerp(C.hemiColdSky, light.cold);
    hemi.groundColor.copy(tmpB.copy(C.hemiNightGround).lerp(C.hemiDayGround, day));
    moon.intensity = lerp(0.42, 0, smooth(0, 0.6, day));
    (scene.background as THREE.Color).copy(C.nightSky).lerp(C.daySky, smooth(0.1, 0.9, day));
    scene.fog!.color.copy(scene.background as THREE.Color);
    for (const m of polished) m.envMapIntensity = lerp(0.04, 0.26, day) * (1 - light.rain * 0.4);
    phone.glow.intensity = 1.25 * Math.min(1, phone.wake * 1.6) * (1 - day * 0.9);

    renderer.render(scene, camera);
    updateAnchors();
    first = false;

    if (motion > 0.002 || pointer.active) awakeUntil = Math.max(awakeUntil, now + 400);
    if (running && now < awakeUntil) raf = requestAnimationFrame(frame);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const nextPortrait = width / height < 0.9;
    if (nextPortrait !== portrait || first) {
      portrait = nextPortrait;
      applyLayout(true);
    } else {
      fitCamera();
    }
    poke();
  }

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    pointer.px = e.clientX - rect.left;
    pointer.py = e.clientY - rect.top;
    pointer.active = pointer.py >= 0 && pointer.py <= rect.height && !opts.reduced;
    poke(1200);
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer.active = false;
    poke(1200);
  });

  resize();

  return {
    state,
    set(next) {
      let changed = false;
      for (const key of Object.keys(next) as (keyof StoryState)[]) {
        if (next[key] !== undefined && state[key] !== next[key]) {
          (state as unknown as Record<string, unknown>)[key] = next[key];
          changed = true;
        }
      }
      if (!changed) return;
      applyLayout(opts.reduced);
      poke();
    },
    setTime(t) {
      time = clamp01(t);
      poke(800);
    },
    setDrift(p) {
      drift = clamp01(p);
      poke(800);
    },
    setSafe(s) {
      safes = Array.isArray(s) ? s : [s];
      const next = chooseLayout();
      if (JSON.stringify(next.frame) !== JSON.stringify(layout.frame)) applyLayout(opts.reduced);
      fitCamera();
      poke();
    },
    kick(v) {
      if (opts.reduced) return;
      wind = THREE.MathUtils.clamp(wind + v * 0.00012, -1, 1);
      poke(900);
    },
    wakePhone(level = 1, clock) {
      wakeTarget = level;
      if (clock) phone.setClock(clock);
      poke(3000);
    },
    setRunning(on) {
      running = on;
      if (on) {
        last = performance.now();
        poke(600);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resize,
  };
}
