---
status: accepted
date: 2026-10-18
decision-makers: implementer
---

# The viewer reaches its host through a bridge and colours itself from tokens

## Context and Problem Statement

The map viewer called the VS Code webview API directly and coloured itself with `--vscode-*` theme variables ([ADR 0024](0024-theme-colour-mapping-and-svg-styling.md)). The diagram page (RCH-01) and the cloud site need the same viewer outside VS Code, where neither exists (spec v0.3 VWR-01).

## Considered Options

* A bridge module and `--sustain-*` tokens that each host sets
* A separate viewer build per host

## Decision Outcome

Chosen option: "A bridge module and `--sustain-*` tokens that each host sets", because one viewer then renders the same DOM everywhere and only the host differs.

* `webview/bridge.ts` holds the installed host and offers `post(message)` and `onMessage(handler)`. `webview/viewer.ts` uses nothing else to reach its host.
* `webview/hosts/vscode.ts` maps every token to a VS Code theme variable, with the fallbacks ADR 0024 used, and posts through the webview API. `webview/hosts/standalone.ts` sets a light or dark palette from the system setting and delivers the messages the page embeds.
* `webview/styles.css` uses only `--sustain-*` tokens. Type colours, the 12 % fill and stroke widths stay as ADR 0024 set them.
* Tokens are set through the CSS object model on `body`, which the webview's CSP allows.
* The font family token holds the resolved family, because text is measured on a canvas.

### Consequences

* Good, because the diagram page and the cloud site reuse the viewer and its tests.
* Bad, because a new colour needs a token in every host. A test checks that each host defines every token the stylesheet uses.
