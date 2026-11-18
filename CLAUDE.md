# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start development server at localhost:4321
- `npm run build` - Build production site to ./dist/ (Cloudflare adapter)
- `npm run preview` - Preview production build locally

## What this is

The marketing site for Styleum (App Store name "Styleum: Daily Fits"), an iPhone app that builds four outfits
from the clothes you already own and delivers them at 9:00 every morning. Live at https://styleum.xyz.
Astro 5 + Tailwind v4 (tokens only; components use scoped CSS) + three.js (the 3D flat-lay) + GSAP ScrollTrigger.

## Site facts live in one place

`src/site.ts` holds the store link, support email, pricing, tagline and social links. `cta` is derived from it and
every button on the site renders through `src/components/Cta.astro`. Change facts there, nowhere else.

## The idea

Styleum lays out your clothes before you wake. So the page is a flat-lay: sixteen garments on a sheet, in real
time 3D. At night they are a pile around a glowing phone; at 9:00 the sun comes through a window and they sort
themselves into four outfits. Every later beat rearranges the same sixteen pieces.

## Design system (`src/styles/global.css`)

- Colours: `ink` #0B0C10 and `chalk` #F4F3EE carry the page. `indigo`, `sky`, `dawn` form the 9:00 sky gradient
  (`--sky`), used only where light belongs. All other colour comes from the clothes in the scene.
- Type: one variable family, Archivo. `.display` is wide (font-stretch 125%), heavy and uppercase; body is normal
  width. Emphasis inside `.display` (`<em>`) is the same face at weight 300. **No italics anywhere, no serif, no
  monospace labels.** The phone UI uses the system SF stack (`--font-ui`) so it reads as a real iPhone.
- Headline lines are authored as `.line > .line__in` and never wrap (`white-space: nowrap`), because they animate
  their width (font-stretch) as they rise. Keep each line to about 11 characters or it will overflow on phones.
- Motion: `[data-reveal]` and `[data-lines]` are CSS transitions triggered by a class from an IntersectionObserver.
  `prefers-reduced-motion` collapses everything to static states, including the 3D stage (it snaps, never tweens).
- Buttons: `.btn` with `--solid`, `--chalk`, `--ghost`, `--sm`. Slightly rounded rectangles, not pills.

## Structure

```
src/
├── site.ts                 # Facts + derived CTA
├── content/
│   ├── wardrobe.ts         # Demo wardrobe, today's four (never share a piece), occasions, forecasts
│   ├── garments.ts         # Garment drawings as data (body, seams, bands, openings, buttons, stitching, folds):
│   │                       #   one source for the SVG symbols and the 3D cloth
│   └── faqs.ts             # FAQ copy + FAQPage schema source
├── scene/                  # three.js, loaded lazily by scripts/motion.ts
│   ├── bake.ts             # Pure typed-array bake: relief + weave → normal map, coarse height, colour per item
│   ├── bake.worker.ts      # Runs bake.ts in a worker pool (falls back to the main thread)
│   ├── cloth.ts            # Turns baked maps into meshes and materials; one slightly warped plane per item
│   ├── phone.ts            # The 3D phone; its lock screen is painted to a canvas and lights the scene
│   ├── layouts.ts          # Choreography: where every garment lies in each beat, wide and tall variants
│   └── stage.ts            # Renderer, light (sun through a window cookie), camera fit, easing, public API
├── components/
│   ├── Nav.astro           # Fixed nav; colour follows html[data-nav], hides on scroll down
│   ├── Story.astro         # Pinned stage + six beats of copy (night, looks, wardrobe, forecast, wear, styleme)
│   ├── App.astro           # The coded iPhone with its five screens on an auto-advancing tab list
│   ├── Phone.astro         # Code-rendered iPhone; screens switch on data-screen / data-occasion
│   ├── Garments.astro      # SVG <symbol> library generated from content/garments.ts (use #g-<kind>)
│   ├── Garment.astro       # <use> wrapper coloured via currentColor
│   ├── Cta.astro           # The store button
│   ├── Label.astro         # Care-label section with five custom symbols
│   ├── Pricing.astro / FAQ.astro / Footer.astro
│   └── FinalCTA.astro      # Closing shot: live countdown to 9:00; the 3D canvas is docked back in here
├── layouts/
│   ├── Layout.astro        # Head, fonts, SEO, JSON-LD
│   └── DocLayout.astro     # Privacy / terms / support prose layout
├── scripts/motion.ts       # Scroll → beat, measures copy to place the scene, controls, canvas docking
└── pages/                  # index, support, privacy, terms, o/[id] (SSR shared outfit)
```

## Key patterns

- The story is a sticky `.stage` (canvas + stacked copy) followed by empty `.step` spacers. Whichever step crosses
  55% of the viewport sets the beat: `motion.ts` swaps the active `.copy` and calls `stage.set({ beat })`.
- The stage never knows about scroll. Its API is `set`, `setTime` (night→day), `setDrift`, `setSafe`, `kick`,
  `wakePhone`, `setRunning`, `resize`. It renders on demand and sleeps when nothing is moving.
- `setSafe` takes the screen areas left free by the copy (measured from the DOM). Each beat has a wide and a tall
  layout; the stage picks whichever shows the clothes larger. Do not hard-code positions per breakpoint.
- To add a beat: add a layout in `scene/layouts.ts`, a `.copy` and a `.step` in `Story.astro`. To add a garment:
  add its drawing in `content/garments.ts` and an item in `content/wardrobe.ts`. It appears in both renderers.
- Garments are drawn the way they are made. Use the helpers in `garments.ts`: `seam` (sinks), `panel`/`band`
  (a layer on top), `lip` (the shadow line at a layer's edge, no groove), `inside` (the opening you see into),
  `paint`/`stitch`/`button` (their own colour, resolved per item), `fold` (creases, 3D only). Shoes are pairs
  seen from above with `profile: 'shoe'`.
- Cloth `thickness` must stay under 0.017 and `LEVEL` in `stage.ts` above the tallest cloth, or a thick piece
  cuts through whatever is laid on it. The lit relief does not depend on thickness, so thin is free.
- `bake.ts` must stay free of three.js and DOM access (it runs in a worker). Texture size is 768 on desktop and
  512 on touch devices; the bake takes about a second on a laptop.
- One canvas, two rooms: near the footer `motion.ts` moves the canvas into `FinalCTA` (`beat: 'tomorrow'`) and
  back. The phone there shows the visitor's real time.
- No WebGL, or no JS: the stage shows a CSS gradient and the copy still reads (stacked, without JS).
- Phone.astro sizing is in `cqw` units (container queries); never add media queries inside it.
- `data-nav-theme="light|dark"` on any section tells the nav which text colour to use over it.
- Legal pages are plain HTML inside `<DocLayout>`; keep their content edits, restyle only in DocLayout.
- Do not invent stats, ratings or testimonials. Everything on the page is true of the product.
