# MBLabs.pro

The portfolio one-pager for **Michaël Bracké** — *MBLabs (Michaël Bracké Labs)*.
Azure integration · AI-augmented delivery · full-stack engineering. Belgium-based, freelance & contract,
remote across Europe. The page exists to look stunning and to make it dead-simple to get in touch:
**michael.bracke@mblabs.pro**.

## Stack

- **[Astro](https://astro.build)** (static output) + **TypeScript** — zero server, zero UI-framework runtime.
  The build emits pure static HTML/CSS plus one bundled, content-hashed motion module.
- Bespoke **motion engine** (`src/scripts/engine.ts`): scroll-driven parallax / sweep / hero-fade / reversible
  bloom auras, IntersectionObserver reveals, a live hero data-network `<canvas>`, custom cursor, magnetic CTA,
  3D-tilt cards, scroll-velocity marquees.
- **Bilingual EN ⇄ NL** (toggle in the nav), one-click **accent recolour** (white / lime / cyan / orange).
- Mobile-first, fluid `clamp()` layout from 360 px to 1920 px.

The visual design comes from a Claude Design handoff bundle; `tools/transform.mjs` turns that prototype into the
CSP-safe static markup in `src/generated/` at build time (run automatically via the `prebuild`/`predev` hooks).
The durable design contract lives in the project's knowledge vault (`obsidian-vault → MBLabs.pro`).

## Security

- **Static only** — no backend, no database, no secrets. The contact form is a pure client-side `mailto:` builder;
  nothing leaves the browser.
- **No inline JavaScript** — all behaviour is in bundled modules, so the **CSP** forbids inline scripts
  (`script-src 'self'`). Headers ship in `public/_headers` (CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP).
- External links use `rel="noopener noreferrer"`. No trackers, no third-party scripts.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # -> dist/   (static)
npm run preview    # serve the build

# Playwright validation — full-page screenshots @ 390 / 820 / 1440 / 1920, overflow check
npm run preview &  # or: npm run dev
npm run shots      # writes tools/shots/*.png
```

## Deploy

Any static host (Cloudflare Pages, Netlify, Vercel, GitHub Pages). `public/_headers` carries the security headers
on header-aware hosts; an equivalent CSP `<meta>` is the fallback. Point `mblabs.pro` at the `dist/` output.
