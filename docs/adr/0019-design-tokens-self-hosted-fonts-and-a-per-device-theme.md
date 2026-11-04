# ADR-0019: Design tokens over the old names, bundled fonts and a per-device theme

- **Status:** Accepted
- **Date:** 2026-11-04
- **Change request:** CR-0015

## Context
The founder set out a design system as CSS variables, three Google Fonts, and a theme kept in `localStorage`. The app is plain JavaScript that redraws by replacing HTML, with about 800 lines of CSS and 260 tests tied to its class names and test ids. Its theme lived in the store, and technicians use it on phones with a weak signal.

## Decision
1. **`--kh-*` is the design system; the older `--c-*` names point at it.** A last layer in `styles.css` restyles the existing classes. `.kh-surface`, `.kh-kpi-card`, `.kh-btn-primary` and `.kh-pill` share rules with `.panel`, `.kpi`, `.btn-primary` and `.chip`. Markup keeps its classes and test ids.
2. **Fonts are bundled** through `@fontsource`, the same font files as Google Fonts, not requested from Google. Noto Sans stays as the fallback, for Devanagari.
3. **The theme belongs to the device,** in `localStorage` `kh-theme`, handled by `src/theme.js`. `<html data-theme>` always holds `dark` or `light`. An inline script in `index.html` does the same steps before the first paint. It no longer depends on `settings.theme` in the store, which is kept only as the source of a choice made on an older version.
4. **Top bar controls change the page in place,** so a theme switch, the drawer or typing in the search never redraws a form.
5. **The entrance animation is on a wrapper around the screen, added only when the route changes,** because every state change redraws the page and because a lasting transform would break the `position: fixed` + New button.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| New tokens over the old names, one new layer (chosen) | Every screen changes at once; tests and logic stay | Old rules stay in the file underneath the new layer |
| Rewrite all CSS and markup | A cleaner file | High risk for live apps, for no visible gain now |
| Tailwind | Matches the brief's notation | A new build dependency; the stack policy needs a reason; the brief's classes translate directly |
| Google Fonts link | One line | A request on every cold start on a weak signal; a font flash; visitors' addresses sent to a third party |
| Theme in the store | Already there | Stored per business and read after the app loads, so a wrong-theme flash |

## Consequences
- The gradient's middle stop is `#0369A1`, not the first brief's `#0EA5E9`: the founder chose it on 4 Nov for readable white text.
- Easier: one place to change a colour; a new screen gets both themes for free.
- Harder: `styles.css` now has an older part overridden by a later part. Clean the old rules up when a screen is next rebuilt; check the last layer first when a style seems to have no effect.
- Watch: `backdrop-filter` is off below 760 px and a fixed background is off on touch screens, to keep phones smooth. The server's public bill page and PDF are separate and don't follow this look.
