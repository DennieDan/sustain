# Sustain website

This static site is the future-launch marketing and guided setup site for Sustain. It lives beside the extension and Cloud code in the same repository. It has no build step or runtime dependency.

## Preview

From the repository root, run `python3 -m http.server 8765 --directory site`, then open `http://127.0.0.1:8765/`.

## Before public launch

- Replace the concept interface frames with captures from the finished product. The interactive map and frames use the same checkout example in `site/demo/`.
- Connect the Cloud calls to action to the production signup URL. During development they lead to the Cloud section or Free plan.
- Verify plan limits, billing rules, education eligibility, and the data boundary against the deployed service.
- Review all third-party marks against the current brand guidelines. The Visual Studio Code icon is deliberately absent from the promotional compatibility grid because its brand guidelines restrict that use.
- Confirm marketplace, plugin, Action, and Cloud links after those releases exist.

All fonts, scripts, styles, and image assets are served locally. The information pages use no third-party analytics or advertising trackers.

The third-party icons in `assets/brands/` were fetched from the Simple Icons v15 icon set. Brand names and marks remain the property of their owners; check each owner's usage guidance before publication.
