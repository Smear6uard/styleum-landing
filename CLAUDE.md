# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start development server at localhost:4321
- `npm run build` - Build production site to ./dist/
- `npm run preview` - Preview production build locally

## Architecture

Styleum is a bold editorial landing page for a fashion AI app, built with Astro and Tailwind CSS v4.

**Design Philosophy:**
- Dark hero → light body for instant drama
- Bold typography (88px headlines, -0.03em letter-spacing, 1.05 line-height)
- Fewer sections, more impact
- Screenshot overlaps between sections
- Grain texture on dark sections

**Color Palette** (defined in `src/styles/global.css`):
- `bg-dark` (#111111) - Dark sections (hero, final CTA, footer)
- `bg-white` (#FFFFFF) - Light sections
- `bg-light` (#F8F8F8) - Alternating sections
- `text-white` / `text-primary` (#111111) - Text colors
- `text-secondary` (#6B7280) / `text-muted` (#9CA3AF) - Muted text
- `accent` (#6F7C86) - Accent color

**Project Structure:**
```
src/
├── components/
│   ├── Container.astro      # Max-width wrapper
│   ├── Header.astro         # Scroll-aware header (transparent → white)
│   ├── Hero.astro           # Dark hero with grain texture
│   ├── MagicMoment.astro    # Outfit result showcase
│   ├── Ritual.astro         # 3-step timeline
│   ├── Gallery.astro        # 3 screenshot grid
│   ├── Positioning.astro    # Comparison (no cards)
│   ├── Pricing.astro        # Free + Pro cards
│   ├── FinalCTA.astro       # Dark bottom CTA
│   └── Footer.astro         # Dark footer
├── layouts/
│   └── Layout.astro         # Base layout with SEO
├── pages/
│   └── index.astro          # Single landing page
└── styles/
    └── global.css           # Tailwind v4 theme + utilities
```

**Key Patterns:**
- `Header.astro` uses IntersectionObserver to detect scroll state
- Dark sections use `.grain` utility for noise texture
- `.glow` / `.glow-lg` for radial glow behind screenshots
- Hero screenshot overlaps into MagicMoment via negative margin
- All links use `#` as placeholder until app is published
