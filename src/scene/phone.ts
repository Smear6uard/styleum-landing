/**
 * The phone lying on the pile. Its lock screen is painted to a canvas so it
 * can wake at 9:00 and throw real light across the clothes around it.
 */
import * as THREE from 'three';
import { site } from '../site';
import { weather } from '../content/wardrobe';

export const PHONE_W = 0.5;
export const PHONE_H = PHONE_W * (844 / 390);
const DEPTH = 0.045;

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface Phone {
  group: THREE.Group;
  glow: THREE.PointLight;
  /** 0 = asleep, 1 = lock screen lit with the notification in place */
  setWake(v: number): void;
  /** The time on the lock screen */
  setClock(label: string): void;
  wake: number;
}

export function createPhone(): Phone {
  const group = new THREE.Group();
  group.name = 'phone';

  const corner = PHONE_W * 0.15;
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRect(PHONE_W, PHONE_H, corner), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 4,
    curveSegments: 20,
  });
  const body = new THREE.Mesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({ color: '#17181d', roughness: 0.38, metalness: 0.55 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Screen
  const W = 780;
  const H = 1688;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const inset = PHONE_W * 0.03;
  const sw = PHONE_W - inset * 2;
  const sh = PHONE_H - inset * 2;
  const screenGeo = new THREE.ShapeGeometry(roundedRect(sw, sh, corner - inset), 20);
  const pos = screenGeo.attributes.position;
  const uv = screenGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, pos.getY(i) / sh + 0.5);
  const screen = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = DEPTH + 0.0085;
  group.add(screen);

  const glow = new THREE.PointLight("#ffd9bd", 0, 3.4, 2);
  glow.position.set(0, -PHONE_H * 0.12, 0.42);
  group.add(glow);

  const logo = new Image();
  let logoReady = false;
  logo.onload = () => {
    logoReady = true;
    paint();
  };
  logo.src = '/StyleumLogo1.png';

  const font = (px: number, weight: number) => `${weight} ${px}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  let clock: string = site.ritualTime;
  const state: Phone = { group, glow, wake: 0, setWake, setClock };

  function paint() {
    const v = state.wake;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (v <= 0.001) {
      tex.needsUpdate = true;
      return;
    }
    const lit = Math.min(1, v * 2.5);
    ctx.globalAlpha = lit;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0f1330');
    sky.addColorStop(0.34, '#1c2140');
    sky.addColorStop(0.62, '#5b6c9e');
    sky.addColorStop(0.82, '#c99a8a');
    sky.addColorStop(1, '#e9b48e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sun = ctx.createRadialGradient(W / 2, H * 0.78, 0, W / 2, H * 0.78, W * 0.62);
    sun.addColorStop(0, 'rgba(255,226,196,0.62)');
    sun.addColorStop(0.4, 'rgba(233,180,142,0.2)');
    sun.addColorStop(1, 'rgba(233,180,142,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = lit * 0.92;
    ctx.font = font(40, 500);
    ctx.fillText(dateLabel, W / 2, 270);
    ctx.globalAlpha = lit;
    ctx.font = font(196, 300);
    ctx.fillText(clock, W / 2, 452);

    // notification slides in for the second half of the wake
    const n = Math.min(1, Math.max(0, (v - 0.45) / 0.55));
    const e = 1 - Math.pow(1 - n, 3);
    if (n > 0) {
      const x = 30;
      const y = 520 - (1 - e) * 44;
      const w = W - 60;
      const hgt = 196;
      ctx.globalAlpha = e;
      rr(ctx, x, y, w, hgt, 50);
      ctx.fillStyle = 'rgba(244,243,238,0.24)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      rr(ctx, x + 28, y + 34, 84, 84, 22);
      ctx.fillStyle = '#f4f3ee';
      ctx.fill();
      if (logoReady) ctx.drawImage(logo, x + 39, y + 45, 62, 62);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = font(30, 600);
      ctx.fillText(site.name, x + 136, y + 62);
      ctx.textAlign = 'right';
      ctx.globalAlpha = e * 0.6;
      ctx.font = font(26, 400);
      ctx.fillText('now', x + w - 30, y + 62);
      ctx.textAlign = 'left';
      ctx.globalAlpha = e;
      ctx.font = font(31, 600);
      ctx.fillText('Your four looks are ready', x + 136, y + 104);
      ctx.globalAlpha = e * 0.86;
      ctx.font = font(28, 400);
      ctx.fillText(`${weather.temp} and ${weather.label.toLowerCase()}, ${weather.note}.`, x + 136, y + 144);
      ctx.fillText('Tap to see this morning’s picks.', x + 136, y + 180);
    }

    // island, home bar
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    rr(ctx, W / 2 - 118, 34, 236, 68, 34);
    ctx.fill();
    ctx.globalAlpha = lit * 0.9;
    ctx.fillStyle = '#fff';
    rr(ctx, W / 2 - 134, H - 34, 268, 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  function setClock(label: string) {
    if (label === clock) return;
    clock = label;
    paint();
  }

  function setWake(v: number) {
    const next = Math.min(1, Math.max(0, v));
    if (next === state.wake) return;
    state.wake = next;
    glow.intensity = 1.25 * Math.min(1, next * 1.6);
    paint();
  }

  paint();
  return state;
}
