---
status: accepted
date: 2026-10-10
decision-makers: owner
---

# TypeScript, npm, esbuild, vitest; plain TypeScript SVG webview

## Context and Problem Statement

The extension, the webview and the skill scripts share one model. What language, build tool and test runner do we use, and does the webview use a UI framework?

## Considered Options

* TypeScript with npm, esbuild bundles and vitest; the webview is plain TypeScript rendering SVG
* TypeScript with webpack and a React webview
* TypeScript compiled by `tsc` without bundling; mocha for all tests

## Decision Outcome

Chosen option: "TypeScript with npm, esbuild bundles and vitest; the webview is plain TypeScript rendering SVG", because esbuild produces all three targets (extension CJS, webview IIFE, Node ESM scripts) quickly from one source tree, vitest runs both Node and DOM tests, and a diagram renderer does not need a component framework.

### Consequences

* Good, because there is one language and one model across host, webview and scripts.
* Good, because the webview bundle contains only our code and elkjs.
* Bad, because DOM updates in the webview are written by hand.

### Confirmation

`npm run check` runs `tsc --noEmit` (strict), `vitest run` and `npm run build`; NFR-QUAL-02 lists the allowed dependencies.

## Pros and Cons of the Options

### TypeScript, esbuild, vitest, plain SVG

* Good, because builds are fast and dependency-light.
* Bad, because esbuild does not type-check; `tsc --noEmit` runs separately.

### webpack and React

* Good, because UI composition is familiar.
* Bad, because it adds dependencies and bundle size for a single SVG canvas.

### Unbundled `tsc` output and mocha

* Good, because there is no bundler.
* Bad, because the skill scripts must be dependency-free single files, which needs a bundler anyway.
