# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start development server at localhost:4321
- `npm run build` - Build production site to ./dist/ (Cloudflare adapter)
- `npm run preview` - Preview production build locally

## What this is

The marketing site for Styleum (App Store name "Styleum: Daily Fits"), an iPhone app that builds four outfits
from the clothes you already own and delivers them at 9:00 every morning. Live at https://styleum.xyz.
Astro 5 + Tailwind v4 (tokens only; components use scoped CSS) + GSAP ScrollTrigger.

## Site facts live in one place

`src/site.ts` holds the store link, support email, pricing, tagline and social links. `cta` is derived from it and
every button on the site renders through `src/components/Cta.astro`. Change facts there, nowhere else.

## Design system (`src/styles/global.css`)

- Colours: `ink` #0B0C10 and `chalk` #F4F3EE carry the page. `indigo`, `sky`, `dawn` form the 9:00 sky gradient
  (`--sky`) used only where light belongs: the phone wallpaper, the horizon rule, glows and hover states.
- Type: Bodoni Moda (display, `.display`), Schibsted Grotesk (body), Geist Mono (labels, `.eyebrow`, `.mono`).
  The phone UI uses the system SF stack (`--font-ui`) so it reads as a real iPhone.
- Motion: `[data-reveal]` and `[data-lines]` are CSS transitions triggered by a class from an IntersectionObserver.
  Keyframes are global. `prefers-reduced-motion` collapses everything to static states.
- Buttons: `.btn` with `--solid`, `--chalk`, `--ghost`, `--sm`.

## Structure

```
src/
├── site.ts                 # Facts + derived CTA
├── content/
│   ├── wardrobe.ts         # Demo wardrobe, today's four, occasions (drives the phone)
│   └── faqs.ts             # FAQ copy + FAQPage schema source
├── components/
│   ├── Nav.astro           # Fixed nav; colour follows html[data-nav], hides on scroll down
│   ├── Story.astro         # Hero + 5 scroll chapters beside one sticky phone
│   ├── Phone.astro         # Code-rendered iPhone; screens switch on data-screen / data-occasion
│   ├── Garments.astro      # SVG <symbol> library of garments (use #g-<kind>)
│   ├── Garment.astro       # <use> wrapper coloured via currentColor
│   ├── Cta.astro           # The store button
│   ├── Label.astro         # Care-label section with five custom symbols
│   ├── Pricing.astro / FAQ.astro / FinalCTA.astro (live countdown to 9:00) / Footer.astro
├── layouts/
│   ├── Layout.astro        # Head, fonts, SEO, JSON-LD
│   └── DocLayout.astro     # Privacy / terms / support prose layout
├── scripts/motion.ts       # GSAP: intro, night→day scrub, chapter→screen toggles, pointer tilt
└── pages/                  # index, support, privacy, terms, o/[id] (SSR shared outfit)
```

## Key patterns

- The story grid places the phone in column 2 spanning all chapter rows so `position: sticky` works without pinning.
  On mobile the phone sits in a fixed-height row and chapters read beneath it.
- Phone sizing is in `cqw` units (container queries); never add media queries inside Phone.astro.
- `data-nav-theme="light|dark"` on any section tells the nav which text colour to use over it.
- Legal pages are plain HTML inside `<DocLayout>`; keep their content edits, restyle only in DocLayout.
- Do not invent stats, ratings or testimonials. Everything on the page is true of the product.
