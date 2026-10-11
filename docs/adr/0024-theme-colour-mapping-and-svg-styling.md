---
status: accepted
date: 2026-10-11
decision-makers: implementer
---

# Theme colour mapping and SVG styling

## Context and Problem Statement

FR-VIEW-05 maps component types, boundary kinds and connection variants to VS Code theme variables and fixes stroke widths. It leaves open how the SVG gets those colours under a CSP without inline styles, how a 12 % fill and arrowheads in variant colours are produced, and what colours secondary elements (tag badges, boundary labels, label halos) use.

## Decision Drivers

* Colours must follow theme switches without re-rendering.
* No inline `style` attributes in markup (NFR-SEC-01); CSSOM writes are allowed.
* Only `--vscode-*` variables (FR-VIEW-05).

## Considered Options

* Classes per type/variant/kind in `dist/webview.css` that set one custom property (`--node-color`, `--edge-color`), consumed by shared rules; per-edge arrowhead paths; `paint-order: stroke` halos
* Colours computed in TypeScript from `getComputedStyle` and written as SVG attributes
* SVG `<marker>` arrowheads with `context-stroke`

## Decision Outcome

Chosen option: "Classes setting one custom property, per-edge arrowhead paths, `paint-order` halos", because the stylesheet alone reacts to theme changes and every colour stays a `var(--vscode-…)` reference.

* `g.node.node--<type>` sets `--node-color` to the FR-VIEW-05 variable; `.node__box` fill is `color-mix(in srgb, var(--node-color) 12%, transparent)` with a 1.5 px stroke in `--node-color`; label `--vscode-foreground` bold; sublabel `--vscode-descriptionForeground`; tag text in `--node-color` on a pill filled with 22 % of `--node-color` mixed into `--vscode-editor-background`.
* `g.edge.edge--<variant>` sets `--edge-color` and width (default `--vscode-foreground` 1.25 px, emphasis `--vscode-focusBorder` 2.5 px, security `--vscode-charts-red` 1.5 px, dashed 1.25 px with `6 4`). Each edge draws its own filled arrowhead path (9 px long) and the line stops at its base, so the head takes the variant colour without `context-stroke`.
* Edge labels: 11 px, halo via a 4 px `--vscode-editor-background` stroke with `paint-order: stroke`.
* Boundaries: dashed (`6 4`) 1.25 px `--vscode-panel-border`, rx 8, no fill; label 12 px weight 600 at (x+10, y+16) in `--vscode-descriptionForeground`; `security-group` stroke and label `--vscode-charts-red`.
* Font: `--vscode-font-family` (canvas measurement uses the same family; text sizes come from `src/layout/measure.ts`).

### Consequences

* Good, because switching the VS Code theme recolours the open diagram immediately.
* Good, because no inline styles are needed.
* Bad, because `color-mix` needs a recent Chromium (VS Code's Electron has it).

### Confirmation

`test/dom/render.test.ts` asserts element counts and the classes per type, variant and kind for every fixture; theme switching is the owner's `[manual]` check (FR-VIEW-05). A headless-Chromium smoke run of `dist/webview.js` under the exact CSP rendered the `archify-runtime` fixture in auto mode with no CSP violations (2026-10-11, progress log).

## Pros and Cons of the Options

### Classes with custom properties

* Good, because the CSS is the single source of colour.
* Bad, because the mapping lives in CSS, not TypeScript, so unit tests check class names rather than colours.

### Colours computed in TypeScript

* Good, because tests could assert colours.
* Bad, because a theme switch would need a re-render.

### `<marker>` with `context-stroke`

* Good, because one marker definition serves all edges.
* Bad, because `context-stroke` support is incomplete, so heads would need one marker per variant.
