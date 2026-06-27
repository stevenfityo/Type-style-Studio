# Style Design Studio — Figma Plugin

Generates Figma Text Styles from the Tailwind CSS type scale and binds them to local Variables (tokens).

## Project structure

```
manifest.json   — Figma plugin manifest
code.js         — Plugin sandbox logic (runs inside Figma)
ui.html         — Plugin UI (runs in iframe, communicates via postMessage)
```

## Architecture

The plugin follows the standard Figma plugin split:

- **`code.js`** runs in Figma's sandbox. It has access to the Figma API (`figma.*`) but no DOM.
- **`ui.html`** runs in a sandboxed iframe. It renders the UI and sends messages to `code.js` via `parent.postMessage({ pluginMessage: {...} }, '*')`.
- **`code.js`** sends messages back via `figma.ui.postMessage({...})`.
- **`ui.html`** receives them via `onmessage = (e) => { const msg = e.data.pluginMessage; }`.

## Message types

| Direction | type | Description |
|---|---|---|
| UI → code | `scan-variables` | Scan local variables on plugin open (STRING vars + hasTypography) |
| UI → code | `scan-all-variables` | Return all variable names (for the Tab 1 token-status table) |
| UI → code | `create-tokens` | Create full Typography variable collection |
| UI → code | `create-missing-tokens` | Add missing tokens to existing collection |
| UI → code | `validate-tokens` | Check all required tokens exist before creating styles |
| UI → code | `create-styles` | Batch-create Figma Text Styles |
| UI → code | `create-preview-frame` | Generate an on-canvas size × weight preview frame |
| UI → code | `scan-colors` | Check if `_Primitives` color palette exists |
| UI → code | `create-colors` | Create the Tailwind color primitives in `_Primitives` |
| UI → code | `scan-scale` | Check the `Primitive` collection's `scale/*` group |
| UI → code | `create-scale` | Create the `Primitive/scale` variables at a given base |
| UI → code | `update-scale` | Rescale `Primitive/scale` to a new base (14 ⇄ 16) |
| UI → code | `audit-scan` | Scan text nodes for missing/mismatched styles |
| UI → code | `audit-apply` | Apply chosen styles to scanned nodes |
| UI → code | `audit-select` | Select scanned nodes on the canvas |
| UI → code | `load-settings` / `save-settings` | Read/write settings in `figma.clientStorage` |
| UI → code | `cancel` | Close the plugin |
| code → UI | `variables-ready` | Returns string vars + hasTypography flag |
| code → UI | `all-variables-ready` | All variable names for the status table |
| code → UI | `tokens-created` | Typography collection created successfully |
| code → UI | `missing-tokens-created` | Missing tokens added to existing collection |
| code → UI | `tokens-ok` | All tokens validated — proceed to create styles |
| code → UI | `tokens-missing` | List of missing tokens with group/name/expected |
| code → UI | `styles-created` | Reports created/skipped/errors counts |
| code → UI | `preview-created` | Preview frame created (row count) |
| code → UI | `colors-ready` | Reports present/total Tailwind color vars in `_Primitives` |
| code → UI | `colors-created` | Reports created/skipped color-variable counts |
| code → UI | `scale-ready` | Reports whether `Primitive/scale` exists + current base/count |
| code → UI | `scale-created` / `scale-updated` | Scale created / rescaled (base, count) |
| code → UI | `audit-results` | Scanned items, totals, and local styles |
| code → UI | `audit-applied` | Reports applied/errors counts |
| code → UI | `settings-loaded` / `settings-saved` | Settings round-trip acknowledgements |
| code → UI | `error` | Generic error string |

## Payload shapes

### `create-styles` / `validate-tokens`
```js
{
  fontFamily: string,          // e.g. "IBM Plex Sans"
  sizeData:  [{ token, size, lh }],   // full size objects (base + custom)
  weightData:[{ label, styleStr }],   // full weight objects (base + custom)
  sizes:   string[],           // token names — kept for backwards compat
  weights: string[],           // weight labels — kept for backwards compat
}
```

### `create-missing-tokens`
```js
{
  missing: [{ group, name, expected }],
  fontFamily: string
}
```

### `create-tokens`
```js
{
  fontFamily: string,         // → fontFamily/body
  fontFamilyDisplay: string   // → fontFamily/display (falls back to fontFamily if empty)
}
```

The Tokens tab has a **"What to create"** selector (Typography / Colors / both) and
separate **body** and **display** font-family inputs. The single *Create Tokens*
footer button creates whichever scopes are selected.

## Variable naming convention (`_Primitives` collection — colors)

Tailwind CSS v3 default palette, primitives only (no semantic aliases yet).
The Tokens tab "What to create" selector lets the user create Typography, Colors, or both.

| Group | Name pattern | Type |
|---|---|---|
| Color shade | `color/blue/500`, `color/red/50` … `color/{family}/{shade}` | COLOR |
| Base color | `color/white`, `color/black` | COLOR |

22 families × 11 shades (50–950) + black/white = 244 variables. Hex values live in
`TAILWIND_COLORS` / `TAILWIND_BASE` in `code.js` and are converted to Figma RGB on creation.

## Variable naming convention (`Primitive` collection — scale)

A primitive spacing/size scale, independent of typography and colors.

| Group | Name pattern | Type |
|---|---|---|
| Scale step | `scale/1`, `scale/0-5`, `scale/2-5`, `scale/neg-1`, … | FLOAT |

Keys map to multipliers (`scale/1` = base, `scale/2` = 2× base, `neg-*` = negative).
The Tokens tab can create the scale at a **14px** or **16px** base, or rescale an
existing one between the two (ratio-preserving). Keys + parsing live in `SCALE_KEYS` /
`parseScaleKey` in `code.js`.

## Variable naming convention (Typography collection)

| Group | Name pattern | Type |
|---|---|---|
| Font family | `fontFamily/body`, `fontFamily/display` | STRING |
| Font weight | `fontWeight/Regular`, `fontWeight/Bold`, … | STRING (font style string) |
| Font size | `fontSize/text-xs` … `fontSize/text-5xl` | FLOAT |
| Line height | `lineHeight/text-xs` … `lineHeight/text-5xl` | FLOAT |

## Text style naming convention

```
{token}/{weightLabel}
e.g.  text-xs/Regular
      text-2xl/SemiBold
```

## Default scale (Tailwind-based)

| Token | Size (px) | Line height (px) |
|---|---|---|
| text-xs | 12 | 16 |
| text-sm | 14 | 20 |
| text-md | 16 | 24 |
| text-lg | 18 | 28 |
| text-xl | 20 | 28 |
| text-2xl | 24 | 32 |
| text-3xl | 30 | 36 |
| text-4xl | 36 | 40 |
| text-5xl | 48 | 48 |

Default weights: `Regular`, `Medium`, `Semibold` (`SemiBold`), `Bold`

## Important gotchas

- **Font style strings are case-sensitive and font-specific.** IBM Plex Sans uses `"SemiBold"`, Inter uses `"Semi Bold"`. The `fontWeight/*` variable value is used as the style string — edit the token value if the font differs.
- **`ts.fontName` must be set BEFORE `ts.fontSize`** — Figma throws "unloaded font" otherwise because a new `createTextStyle()` defaults to Inter Regular.
- **Inter Regular must be loaded before any style creation loop** — `createTextStyle()` initialises with Inter Regular regardless of the target font.
- **Figma plugin sandbox does not support `??` (nullish coalescing operator)** — use explicit `!== null && !== undefined` checks instead.
- **`setBoundVariable` for `lineHeight`** binds the pixel value; `lineHeight` must be set as `{ unit: 'PIXELS', value }` first.

## Running / testing

1. Open Figma Desktop
2. Plugins → Development → Import plugin from manifest → select `manifest.json`
3. Run on any `.fig` file
4. To reload after code changes: right-click canvas → Plugins → Development → Style Design Studio (or use the ⌘⌥P shortcut in Figma)
