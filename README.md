# Style Design Studio

A Figma plugin for building design-system foundations: it generates **typography tokens**, **Tailwind CSS color primitives**, and a **primitive spacing scale** as local Variables, batch-creates **Text Styles** from a Tailwind type scale, and includes a **typography audit** that finds unstyled text and matches it to existing styles.

## Features

- **Tokens** — a *What to create* selector lets you generate **Typography**, **Colors**, or both in one click:
  - **Typography** → a `Typography` variable collection with **body + display** font family, weight, size, and line height, based on a Tailwind-style scale. You can also add only the tokens missing from an existing collection.
  - **Colors** → the full **Tailwind v3 palette** as COLOR primitives under a `_Primitives` collection — `color/{family}/{shade}` plus `color/white` / `color/black` (22 families × 11 shades + 2 = 244 variables). Primitives only, no semantic aliases.
  - **Primitive Scale** → a spacing/size scale under a `Primitive` collection (`scale/<key>`), with a one-click switch between a **14px** and **16px** base.
- **Styles** — batch-create Figma Text Styles (`text-xs/Regular` … `text-5xl/Bold`) bound to the typography variables.
- **Audit** — scan a page, selected frames, or the whole document for text without a style and auto-match it to local (or library) styles.
- **Preview** — generate a frame showing every size × weight combination.

The UI ships with a **light theme by default**; a dark theme is available in *Library Settings*.

## Usage

1. Plugins → Development → **Import plugin from manifest** → select `manifest.json`.
2. Run on any file.
3. Start on the **Tokens** tab to create the variable collections, then **Styles**, then **Audit**.

## Library styles (optional)

The Audit tab can also apply text styles from a published library. This requires a Figma **Personal Access Token** and the library **File Key**, entered in *Library Settings*.

- The token is stored **locally only** (`figma.clientStorage`) and is sent **exclusively** to `https://api.figma.com` to read the library's styles.
- This is fully optional — auditing and applying **local** text styles works without any token or network access.

Network access is declared in `manifest.json` (`networkAccess.allowedDomains` → `https://api.figma.com`).

## Project structure

| File | Role |
|---|---|
| `manifest.json` | Plugin manifest |
| `code.js` | Sandbox logic (Figma API) |
| `ui.html` | Plugin UI (iframe) |

See `CLAUDE.md` for architecture, message types, and conventions.

## Publishing checklist (Figma Community)

- [x] `networkAccess` declared in `manifest.json` with reasoning
- [x] Personal Access Token stored locally only, used solely against `api.figma.com`
- [x] No deprecated synchronous APIs (uses `*Async` variants)
- [ ] Plugin **icon** — 128 × 128 px PNG
- [ ] **Cover art** — 1920 × 960 px
- [ ] Name, tagline, and description
- [ ] Tags (e.g. typography, design tokens, variables, colors, primitives, tailwind)
- [ ] Support contact / docs link

> Icon, cover art, description and tags are entered in Figma's **Publish** dialog, not in the repo.
