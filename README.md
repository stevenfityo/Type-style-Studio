# Font Styles Creator

A Figma plugin that generates Text Styles from the Tailwind CSS type scale and binds them to local Variables (design tokens). Includes a typography audit that finds unstyled text and matches it to existing styles.

<img width="1768" height="759" alt="PlugInScreens" src="https://github.com/user-attachments/assets/c92695fb-8fd8-408d-8e2f-11eda22506d5" />


## Features

- **Tokens** — create a `Typography` variable collection (font family, weight, size, line height) from a Tailwind-based scale, or add only the missing tokens to an existing collection.
- **Styles** — batch-create Figma Text Styles (`text-xs/Regular` … `text-5xl/Bold`) bound to the typography variables.
- **Audit** — scan a page, selected frames, or the whole document for text without a style and auto-match it to local (or library) styles.
- **Preview** — generate a frame showing every size × weight combination.

## Usage

1. Plugins → Development → **Import plugin from manifest** → select `manifest.json`.
2. Run on any file.
3. Start on the **Tokens** tab to create the variable collection, then **Styles**, then **Audit**.

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
- [ ] Tags (e.g. typography, design tokens, text styles, tailwind)
- [ ] Support contact / docs link

> Icon, cover art, description and tags are entered in Figma's **Publish** dialog, not in the repo.
