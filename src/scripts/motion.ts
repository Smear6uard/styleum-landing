/**
 * Motion for the landing page. One orchestrated intro, then a scroll story
 * where the phone's screen follows the chapter in view and the page turns
 * from night to day as the app opens. Everything degrades to static states
 * under prefers-reduced-motion.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const html = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = document.getElementById('phone');
const story = document.getElementById('story');
const storyPhone = document.getElementById('story-phone');
const heroTitle = document.getElementById('hero-title');
const wardrobe = document.getElementById('wardrobe');

const INK = '#0b0c10';
const CHALK = '#f4f3ee';

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
const observeAll = () =>
  document.querySelectorAll('[data-reveal], [data-lines]').forEach((el) => {
    if (el !== heroTitle) io.observe(el);
  });
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

/* ---------- The phone shows the chapter in view ---------- */
document.querySelectorAll<HTMLElement>('[data-chapter]').forEach((ch) => {
  ScrollTrigger.create({
    trigger: ch,
    start: 'top 58%',
    end: 'bottom 58%',
    onToggle: (self) => {
      if (self.isActive && phone) phone.dataset.screen = ch.dataset.screen;
    },
  });
});

/* ---------- Style Me chips drive the phone ---------- */
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.occ-chip'));
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    if (phone) phone.dataset.occasion = chip.dataset.occ;
  });
});

/* ---------- Night to day (the nav follows the sunrise, not the chapters) ---------- */
if (story && wardrobe) {
  const navFromProgress = (p: number) => {
    html.dataset.nav = p > 0.5 ? 'dark' : 'light';
  };
  if (reduce) {
    ScrollTrigger.create({
      trigger: wardrobe,
      start: 'top 70%',
      end: 'max',
      toggleClass: { targets: story, className: 'is-day' },
      onToggle: (self) => navFromProgress(self.isActive ? 1 : 0),
    });
  } else {
    gsap.fromTo(
      story,
      { backgroundColor: INK, color: CHALK },
      {
        backgroundColor: CHALK,
        color: INK,
        ease: 'none',
        immediateRender: true,
        scrollTrigger: {
          trigger: wardrobe,
          start: 'top 100%',
          end: 'top 30%',
          scrub: 0.5,
          onUpdate: (self) => navFromProgress(self.progress),
          onRefresh: (self) => navFromProgress(self.progress),
        },
      },
    );
  }
}

/* ---------- Scrubbed chapter text and hero drift ---------- */
const mm = gsap.matchMedia();

mm.add(
  {
    desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 899px) and (prefers-reduced-motion: no-preference)',
  },
  (ctx) => {
    const { desktop } = ctx.conditions as { desktop: boolean; mobile: boolean };

    gsap.to('#hero .chapter__body', {
      yPercent: -14,
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '#hero',
        start: desktop ? 'bottom 85%' : 'bottom 62%',
        end: desktop ? 'bottom 30%' : 'bottom 12%',
        scrub: true,
      },
    });

    document.querySelectorAll<HTMLElement>('.chapter:not(.chapter--hero) .chapter__body').forEach((body) => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: body,
          start: desktop ? 'top 96%' : 'top 100%',
          end: desktop ? 'bottom 4%' : 'top 46%',
          scrub: 0.4,
        },
      });
      const inEnd = desktop ? 0.16 : 0.2;
      const outStart = desktop ? 0.62 : 0.8;
      tl.fromTo(body, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: inEnd, ease: 'power2.out' }, 0)
        .to(body, { opacity: 0, y: -36, duration: 1 - outStart, ease: 'power2.in' }, outStart);
    });
  },
);

/* ---------- Pointer tilt on the device ---------- */
mm.add('(min-width: 900px) and (hover: hover) and (prefers-reduced-motion: no-preference)', () => {
  if (!phone) return;
  const onMove = (e: PointerEvent) => {
    const r = phone.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
    const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
    gsap.to(phone, {
      rotateY: dx * 9,
      rotateX: -dy * 7,
      transformPerspective: 1400,
      duration: 1.4,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => window.removeEventListener('pointermove', onMove);
});

/* ---------- Intro ---------- */
const play = () => {
  if (reduce) {
    heroTitle?.classList.add('is-in');
    gsap.set('[data-intro]', { opacity: 1, y: 0 });
    return;
  }
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('#nav', { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 1 }, 0.1)
    .fromTo(storyPhone, { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: 1.6 }, 0.2)
    .add(() => heroTitle?.classList.add('is-in'), 0.25)
    .to('[data-intro]', { opacity: 1, y: 0, duration: 1.2, stagger: 0.1 }, 0.55);
};

const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(() => {
  try {
    play();
  } catch (err) {
    console.error(err);
    html.classList.add('no-motion');
  }
  ScrollTrigger.refresh();
});
window.addEventListener('load', () => ScrollTrigger.refresh());
window.addEventListener('error', () => html.classList.add('no-motion'), { once: true });
