# Optional browser modules

These modules are retained because they capture useful catalogue, playback, visual and UX experiments, but they are not part of GARBA's production first-load path.

Production currently loads only:

- `/simple-runtime.js`
- `/nonstop-browser.js`
- `/app.js`

The service worker remains `/sw.js`.

Files in this directory are intentionally excluded from the GitHub Pages runtime artifact. If an optional module becomes production code, promote it deliberately: document the responsibility, add an explicit runtime reference, update the service-worker/deploy contract where required, and extend validation. Do not move it back to the root merely to make it deploy.
