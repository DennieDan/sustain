---
status: superseded by [ADR-0066](0066-units-with-one-way-import-rules.md)
date: 2026-10-18
decision-makers: implementer
---

# The diagram page is one offline HTML file

## Context and Problem Statement

A map could only be seen inside VS Code. People who review a pull request, read a README or use another editor need the same map without the extension. [ADR 0009](0009-validator-owns-geometry-and-meta-fields.md) set `meta.output` to an HTML path that nothing wrote. Spec v0.3 RCH-01 asks for that page.

## Considered Options

* One HTML file with the viewer, its styles and the map inline, allowed by CSP hashes
* A folder with separate script, style and data files
* A page that loads the viewer from a CDN

## Decision Outcome

Chosen option: "One HTML file with the viewer, its styles and the map inline, allowed by CSP hashes", because a single file can be attached, committed or opened from disk, and works offline.

* `render-html.mjs <candidate.json> [--share]` writes the file `meta.output` names, beside the candidate. The skills run it as their last step, and Export Page in the map's title bar and the maps list writes the same page. This amends ADR 0009: `meta.output` is now written.
* The map sits in a `<script type="application/json">` with `<`, `>`, `&`, U+2028 and U+2029 escaped. The CSP is `default-src 'none'` with the inline script and style allowed by their SHA-256 hashes, and the build escapes `</script` inside the bundle.
* The page carries the map only, never file content. The absolute root is included for a page made on this machine and left out with `--share`.
* A clicked citation opens in VS Code, Cursor, JetBrains, on GitHub at the map's revision, or is copied as `path:line`. The choice is remembered in `localStorage` when the browser allows it. A path gets a link only after the citation path rule and the deny-list accept it.

### Consequences

* Good, because the map travels as one file and needs nothing at runtime.
* Bad, because each page carries the whole viewer with its layout engine, about 1.5 MB.
