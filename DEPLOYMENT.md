# Deployment

## Published application

**https://wieslawsoltes.github.io/CelestaStudio/**

The site serves the single-file build from `dist/index.html`. All runtime code and styles are embedded, so the repository subpath requires no special base-URL configuration. HTTPS provides the secure context needed for WebGPU; the application still requires a supported browser and adapter and reports its active renderer in the interface.

## Continuous integration

`.github/workflows/pages.yml` runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. The build job runs Node's core tests, regenerates `dist/index.html`, and runs the 23-check Playwright browser integration suite. Python dependencies are pinned in `requirements-dev.txt`; they are test tooling, not application dependencies.

The tests explicitly launch the full Chromium browser in headless mode, not the separate headless-shell binary, to cover media recording with the same browser family as local validation. Browser integration uses the Canvas 2D fallback in an opaque page to exercise editing and exports without relying on GPU availability on shared runners. A green workflow is not hardware-WebGPU certification, and does not certify IndexedDB recovery on a real origin. The reports preserve these boundaries explicitly.

The workflow uploads the test reports and workspace screenshot as a separate artifact. Only successful builds on `main` publish. Pull requests have read-only repository access and cannot deploy.

## GitHub Pages

GitHub Pages is configured for GitHub Actions. `actions/upload-pages-artifact` packages only `dist/`, and `actions/deploy-pages` publishes through the `github-pages` environment. No personal access token or third-party hosting account is needed.

The build includes `.nojekyll` and `build-info.json`, containing the source commit and SHA-256 of the built HTML. After publication, `scripts/verify-deployment.py` checks the public HTTPS build identity and computes the checksum of the public app response. The deployment job only succeeds once those match the intended build. The successful run summary links to the app and records both identifiers.

## Local development

```sh
npm test
npm run build
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://localhost:8000/` for the modular editor or `http://localhost:8000/dist/` for the standalone build.

To run browser tests, use a Python virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run test:browser
```

Linux hosts may also need Playwright's system libraries (`python -m playwright install --with-deps chromium`). `CHROMIUM_PATH` optionally selects an existing browser. Set `CELESTA_URL` to test a served URL instead of the standalone opaque-page mode; this does not itself certify GPU hardware or autosave recovery.

## Updating and rollback

Edit the modular source, run the tests and build, and push to `main`. The workflow builds and publishes from source. To return to an earlier version, revert the relevant source commit and push the revert; the same checks and deployment verification run again.
