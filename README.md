# Styleum landing

Marketing site for [Styleum: Daily Fits](https://apps.apple.com/us/app/styleum-daily-fits/id6757777880), the iPhone app that builds four outfits from the clothes you already own, every morning at 9:00. Live at [styleum.xyz](https://styleum.xyz).

Built with Astro 5, Tailwind v4 tokens, and GSAP ScrollTrigger. Deployed on Cloudflare.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # ./dist
npm run preview
```

## Where things are

- `src/site.ts` — store link, email, pricing, tagline. Every CTA reads from here.
- `src/content/` — the demo wardrobe that drives the coded phone, and the FAQ copy.
- `src/components/Phone.astro` — the product, rendered in code. No screenshots anywhere on the site.
- `src/scripts/motion.ts` — the scroll story and intro.
- `src/pages/` — home, support, privacy, terms, and `o/[id]` for shared outfits (server-rendered).

See `CLAUDE.md` for the design system and conventions.
