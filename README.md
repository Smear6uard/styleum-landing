# Styleum landing

Marketing site for [Styleum: Daily Fits](https://apps.apple.com/us/app/styleum-daily-fits/id6757777880), the iPhone app that builds four outfits from the clothes you already own, every morning at 9:00. Live at [styleum.xyz](https://styleum.xyz).

Built with Astro 5, Tailwind v4 tokens, three.js and GSAP ScrollTrigger. Deployed on Cloudflare.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # ./dist
npm run preview
```

## Where things are

- `src/site.ts` — store link, email, pricing, tagline. Every CTA reads from here.
- `src/content/` — the demo wardrobe, the garment drawings (shared by the phone UI and the 3D scene), and the FAQ copy.
- `src/scene/` — the real-time 3D flat-lay: cloth baking, the phone, the choreography and the stage.
- `src/components/Story.astro` — the pinned stage and the six beats of copy that play over it.
- `src/components/Phone.astro` — the app, rendered in code. No screenshots or image assets anywhere on the site.
- `src/scripts/motion.ts` — scroll to beat, scene placement, controls.
- `src/pages/` — home, support, privacy, terms, and `o/[id]` for shared outfits (server-rendered).

See `CLAUDE.md` for the design system and conventions.
