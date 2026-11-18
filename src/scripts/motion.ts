/**
 * Motion for the landing page.
 * Scroll decides which beat of the story is on stage; the 3D stage
 * (scene/stage.ts, loaded lazily) eases the clothes, camera and light to
 * match. Everything collapses to static states under prefers-reduced-motion,
 * and the copy still swaps if WebGL never arrives.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Stage, Safe } from '../scene/stage';
import type { Beat } from '../scene/layouts';
import { site } from '../site';

gsap.registerPlugin(ScrollTrigger);
// Mobile browsers fire resize when the address bar collapses; recalculating then causes visible jumps.
ScrollTrigger.config({ ignoreMobileResize: true });

const html = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const story = document.getElementById('story');
const stageEl = document.getElementById('stage');
const canvas = document.getElementById('scene') as HTMLCanvasElement | null;

/* ---------- Reveals: the observer only adds a class, CSS does the rest ---------- */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
);
// Observe only once every stylesheet has applied, so the observer measures real layout.
const observeAll = () => document.querySelectorAll('[data-reveal], [data-lines]').forEach((el) => io.observe(el));
if (document.readyState === 'complete') observeAll();
else window.addEventListener('load', observeAll, { once: true });

/* ---------- Nav colour follows the surface under it ---------- */
document.querySelectorAll<HTMLElement>('[data-nav-theme]').forEach((el) => {
  ScrollTrigger.create({
    trigger: el,
    start: 'top 36px',
    end: 'bottom 36px',
    onToggle: (self) => {
      if (self.isActive) html.dataset.nav = el.dataset.navTheme;
    },
  });
});

/* ---------- The story ---------- */
let stage: Stage | null = null;
let beat: Beat = 'night';
let heroProgress = 0;

const isPhone = () => window.innerWidth < 900;

/**
 * Where the picture may sit on the canvas, leaving room for the words.
 * Measured from the copy itself, so it holds at any viewport and text length.
 */
const safeFor = (b: Beat): Safe | Safe[] => {
  const copy = story?.querySelector<HTMLElement>(`[data-copy="${b}"]`);
  if (!copy || !canvas) return { l: 0, t: 0, r: 1, b: 1 };
  const c = canvas.getBoundingClientRect();
  const r = copy.getBoundingClientRect();
  const top = (r.top - c.top) / c.height;
  const right = (r.right - c.left) / c.width;
  const nav = 84 / c.height;
  if (isPhone()) return { l: 0.04, t: nav, r: 0.96, b: Math.max(0.3, top - 0.025) };
  // beside the words, or in a band above them: the stage takes whichever shows the clothes larger
  const beside = { l: Math.min(0.6, right + 0.03), t: nav, r: 0.9, b: 0.93 };
  if (b === 'night') return { ...beside, r: 0.98, t: 0.05, b: 0.97 };
  const above = { l: 0.16, t: nav, r: 0.9, b: Math.max(0.3, top - 0.04) };
  return [beside, above];
};

const finale = document.getElementById('download');
const finaleDock = document.getElementById('finale-stage');
let inFinale = false;

/** Room for the closing shot: beside its words on a desktop, above them on a phone. */
const finaleSafe = (): Safe => {
  const copy = finale?.querySelector<HTMLElement>('.finale__copy');
  if (!copy || !canvas) return { l: 0.4, t: 0.1, r: 0.98, b: 0.95 };
  const c = canvas.getBoundingClientRect();
  const r = copy.getBoundingClientRect();
  if (isPhone()) return { l: 0.04, t: 0.08, r: 0.96, b: Math.max(0.28, (r.top - c.top) / c.height - 0.02) };
  return { l: Math.min(0.58, (r.right - c.left) / c.width + 0.02), t: 0.08, r: 0.97, b: 0.94 };
};

/** The visitor's own time, the way a lock screen shows it. */
const lockTime = () => {
  const d = new Date();
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function syncTime() {
  // Before the first beat the sky only hints at dawn; crossing into it brings the sun up.
  if (inFinale) stage?.setTime(0);
  else stage?.setTime(beat === 'night' ? heroProgress * 0.16 : 1);
}

/** The one canvas plays two rooms: the story's stage and the closing shot. */
function dock(toFinale: boolean) {
  inFinale = toFinale;
  if (!stage || !canvas || !stageEl || !finaleDock) return;
  const home = toFinale ? finaleDock : stageEl;
  if (canvas.parentElement !== home) home.prepend(canvas);
  stage.resize();
  if (toFinale) {
    stage.setSafe(finaleSafe());
    stage.set({ beat: 'tomorrow' });
    // it is not 9:00 yet: a bare lock screen, showing the real time
    stage.wakePhone(0.44, lockTime());
  } else {
    stage.setSafe(safeFor(beat));
    stage.set({ beat });
    stage.wakePhone(1, site.ritualTime);
  }
  syncTime();
}
window.setInterval(() => inFinale && stage?.wakePhone(0.44, lockTime()), 15000);

function setBeat(next: Beat) {
  if (next === beat) return;
  beat = next;
  if (story) {
    story.dataset.beat = next;
    story.dataset.tone = next === 'night' ? 'night' : 'day';
    story.querySelectorAll<HTMLElement>('[data-copy]').forEach((el) => el.classList.toggle('is-active', el.dataset.copy === next));
    story.querySelectorAll<HTMLElement>('[data-rail]').forEach((el) => el.classList.toggle('is-on', el.dataset.rail === next));
  }
  if (inStory) html.dataset.nav = next === 'night' ? 'light' : 'dark';
  if (inFinale) return;
  stage?.setSafe(safeFor(next));
  stage?.set({ beat: next });
  syncTime();
}

let inStory = true;
if (story) {
  const steps = Array.from(story.querySelectorAll<HTMLElement>('.step'));
  steps.forEach((step) => {
    ScrollTrigger.create({
      trigger: step,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (self.isActive) setBeat(step.dataset.beat as Beat);
      },
    });
  });

  // Pre-dawn glow while the hero scrolls away
  ScrollTrigger.create({
    trigger: steps[0],
    start: 'top top',
    end: 'bottom 55%',
    onUpdate: (self) => {
      heroProgress = self.progress;
      syncTime();
    },
  });

  // The window light slides across the sheet through the rest of the story; scroll speed stirs the cloth
  ScrollTrigger.create({
    trigger: story,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      stage?.setDrift(self.progress);
      stage?.kick(self.getVelocity());
    },
    onToggle: (self) => {
      inStory = self.isActive;
      if (self.isActive) html.dataset.nav = beat === 'night' ? 'light' : 'dark';
    },
  });

  // Controls
  const press = (group: HTMLElement[], on: HTMLElement) => group.forEach((b) => b.setAttribute('aria-pressed', String(b === on)));

  const forecastBtns = Array.from(story.querySelectorAll<HTMLButtonElement>('[data-forecast]'));
  const forecastNote = document.getElementById('forecast-note');
  forecastBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      press(forecastBtns, btn);
      if (forecastNote) forecastNote.textContent = btn.dataset.note ?? '';
      stage?.set({ forecast: btn.dataset.forecast as 'clear' | 'rain' | 'cold' });
    }),
  );

  const pickBtns = Array.from(story.querySelectorAll<HTMLButtonElement>('[data-pick]'));
  pickBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      press(pickBtns, btn);
      stage?.set({ pick: Number(btn.dataset.pick) });
    }),
  );

  const occBtns = Array.from(story.querySelectorAll<HTMLButtonElement>('[data-occ]'));
  const occNote = document.getElementById('occasion-note');
  occBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      press(occBtns, btn);
      if (occNote) occNote.textContent = btn.dataset.note ?? '';
      stage?.set({ occasion: btn.dataset.occ });
    }),
  );

  // Tabbing into a beat that is not on stage brings it on stage
  story.querySelectorAll<HTMLElement>('[data-copy]').forEach((copy) => {
    copy.addEventListener('focusin', () => {
      if (copy.dataset.copy === beat) return;
      const step = steps.find((s) => s.dataset.beat === copy.dataset.copy);
      if (step) window.scrollTo({ top: step.getBoundingClientRect().top + window.scrollY + 4 });
    });
  });
}

if (finale) {
  // Swap rooms while both are well off screen
  ScrollTrigger.create({
    trigger: finale,
    start: 'top 220%',
    end: 'bottom -20%',
    onToggle: (self) => dock(self.isActive),
  });
}

/* ---------- The 3D stage, loaded after first paint ---------- */
async function mountStage() {
  if (!canvas || !stageEl) return;
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2')) return;
    const { createStage } = await import('../scene/stage');
    stage = await createStage(canvas, { reduced: reduce, labels: document.getElementById('scene-labels') });
    if (inFinale) dock(true);
    else {
      stage.setSafe(safeFor(beat));
      stage.set({ beat });
      syncTime();
      window.setTimeout(() => !inFinale && stage?.wakePhone(), reduce ? 0 : 700);
    }
    html.classList.add('scene-on');

    // Only draw while the canvas is on screen
    new IntersectionObserver((entries) => stage?.setRunning(entries[0].isIntersecting), { rootMargin: '10% 0px' }).observe(canvas);

    let w = window.innerWidth;
    let h = window.innerHeight;
    window.addEventListener('resize', () => {
      // ignore the address bar collapsing on phones
      if (window.innerWidth === w && Math.abs(window.innerHeight - h) < 140 && isPhone()) return;
      w = window.innerWidth;
      h = window.innerHeight;
      stage?.resize();
      stage?.setSafe(inFinale ? finaleSafe() : safeFor(beat));
    });
  } catch (err) {
    console.error(err);
  }
}

const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(() => {
  html.classList.add('is-ready');
  ScrollTrigger.refresh();
});
if ('requestIdleCallback' in window) requestIdleCallback(() => mountStage(), { timeout: 600 });
else setTimeout(mountStage, 60);

window.addEventListener('load', () => ScrollTrigger.refresh());
