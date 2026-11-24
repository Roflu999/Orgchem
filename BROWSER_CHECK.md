# Checking the running site without disabling browser sandboxing

**Result on this host:** The real Python server returned HTTP 200 for `/`, health reported `chemistryAvailable: true`, and submitting the lactic-acid enumeration through `/api/v1/jobs` returned **two molecules**. These were HTTP checks, not browser interactions. A fresh server listened on `127.0.0.1:18246` for this run and was stopped afterward.

The Playwright cache held Chromium but no Firefox or WebKit; no Firefox or WebKit browser executable was found on PATH. Chromium has no usable OS sandbox here. No visual browser was launched and no screenshot was produced. Instead, jsdom 31.0.1 was installed under `browser-check/` with install scripts disabled. The DOM driver passed against the loopback site: startup stereoisomers, six benzene builder atoms, Arabic/English switching, formula deduction, filtered versus total counts, and a systematic name round trip. Each test server was stopped afterward. No browser sandbox or host policy was changed.

## Run the DOM check locally

Use a trusted checkout and its own loopback server. This requires the project's Python 3.13 environment (see `LOCAL_SETUP.md`) and Node compatible with jsdom (`^22.22.2`, `^24.15.0`, or `>=26`). Commands start at the project root. If an execution permission prompt is denied, stop there rather than rerouting the command.

1. Install the test-only dependencies from the lockfile. This step needs npm registry access; the check itself needs only the local site.

   ```sh
   npm --prefix browser-check ci --ignore-scripts --no-audit --no-fund
   ```

   On this host npm is installed outside PATH: use `node /opt/npm/bin/npm-cli.js` in place of `npm`. This tooling is separate from the app's dependencies.

2. In one terminal, start the normal server on a free loopback port. Leave its terminal open.

   ```sh
   .venv/bin/python serve.py --host 127.0.0.1 --port 18246
   ```

3. In another terminal, check readiness, then run the DOM driver. The only optional argument is a port (default `8000`). Stop your server with Ctrl+C afterward.

   ```sh
   node -e "fetch('http://127.0.0.1:18246/api/v1/health').then(r=>r.json()).then(console.log)"
   node browser-check/live-dom.mjs 18246
   ```

The driver is designed to wait for the two startup stereoisomer cards, open the molecule builder, select benzene and count six SVG atom nodes, then switch to Arabic and back and check labels plus document direction. A failed assertion, timeout, or uncaught DOM error causes a nonzero exit. A `PASS` line refers only to the step named; require exit code zero for the whole check.

## What this checks (and what it doesn't)

The DOM driver loads the **served HTML**, compares its scripts with this checkout, and runs the app-owned scripts in document order. jsdom does not load subresources automatically; the fetch adapter permits only same-origin loopback requests and rejects redirects. No remote browser or external chemistry service is used. Only run this with trusted app code: jsdom is a DOM implementation, **not** a security sandbox.

This exercises event handlers, DOM mutations and the real backend, not the native browser event pipeline. The driver leaves out the 3Dmol renderer, CSS and fonts; supplies inert media-query/resize hooks if absent; and supplies animation-frame timing, not real layout. It cannot verify pixels, responsive layout, WebGL, font shaping, or native accessibility behavior.

For visual verification, use a host where Playwright's Chromium dependencies and OS sandbox already work. With the same server running and `requirements-dev.txt` installed, use `.venv/bin/python -m playwright install chromium` then `.venv/bin/python browser_ui.py --url http://127.0.0.1:18246 --capture`. Retain the default browser sandbox. A DOM pass is not a substitute for that run.
