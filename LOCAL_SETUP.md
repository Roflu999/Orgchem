# Local setup

This is a local, same-origin Python/FastAPI + RDKit app. **Python 3.13** and a browser are required. Node, npm, Playwright, cloud accounts and chemistry API keys are **not** needed to use the app. Get a complete source checkout/archive, including `vendor/`; do not run the HTML file directly with `file://`.

## Quick start from a fresh clone

Replace `<repository-url>` with the repository the project owner supplies and `<checkout>` with your local checkout directory. The placeholder is not a published repository. If Git is not installed, use the source archive instead, extract it and enter that directory. Install Python 3.13 using your OS/Python distributor's instructions; this launcher does not install Python or system packages.

Linux / macOS, in a terminal:

```sh
git clone <repository-url> <checkout>
cd <checkout>
python3.13 run_local.py
```

Windows, in PowerShell:

```powershell
git clone <repository-url> <checkout>
Set-Location <checkout>
py -3.13 run_local.py
```

If Windows has no `py` command, use the full path to your installed Python 3.13 executable (PowerShell needs `&` before a quoted executable path). A different executable name is fine provided `--version` reports Python **3.13**.

Open **http://127.0.0.1:8000** after the server starts. Keep the terminal open; press **Ctrl+C** there to stop. The launcher does not open a browser automatically and binds only to your machine, not your LAN. Do not use it as a public deployment service.

### What the launcher does

Running `run_local.py` explicitly authorizes its announced first-run setup:

1. Check that the launcher interpreter is Python 3.13. Other versions are not validated against the pinned dependencies and are rejected before setup.
2. Create `.venv` with Python's built-in `venv` support if that directory does not exist. No global pip install, `sudo`, system-library installation, browser download or security-setting change is performed.
3. Announce and install **only** the pinned runtime requirements from `requirements.txt` into that new environment. First setup needs network access to your configured Python package index (normally PyPI), including transitive dependencies. Pip may need compatible native wheels for your OS/CPU. Your existing pip proxy/index configuration is respected; no credentials are requested by the launcher.
4. Verify the environment's Python, pinned package versions and runtime imports, then run `serve.py --host 127.0.0.1 --port 8000` using that environment's interpreter.

Later successful runs check the runtime locally and **do not invoke pip or need installation network access**. A previously interrupted, launcher-created installation is announced and retried; a changed `requirements.txt` instead requires explicit `--install`. Pip output is suppressed to avoid logging credential-bearing package-index URLs. For troubleshooting, use the manual route below and review diagnostics locally before sharing them.

Existing directories are never erased or recreated. An existing working Python 3.13 venv can be reused without changing its packages. If its pins are missing/different, the launcher stops; only `--install` explicitly authorizes synchronizing that existing environment. This can upgrade/downgrade packages to the pinned versions, so prefer a dedicated app venv. A broken/partial/non-venv directory is left untouched: inspect it and select a fresh path instead of expecting automatic deletion. Symlinked environment directories/launcher markers are rejected; use the environment's real directory explicitly.

Useful options (Windows: replace `python3.13` with `py -3.13`):

```sh
# If port 8000 is already occupied, leave that process alone and use another port.
python3.13 run_local.py --port 8001

# Prepare/check without starting the server.
python3.13 run_local.py --setup-only

# Explicit update or retry after inspecting an installation failure.
python3.13 run_local.py --install

# Use a new, separately ignored environment instead of overwriting a broken one.
python3.13 run_local.py --venv .venv-clean
```

Relative `--venv` paths are relative to the project directory, even when the launcher is called from elsewhere. Choose `.venv` or `.venv-*` names covered by the ignore rules, or add your custom directory to your own ignore rules before publishing. Virtual environments are machine-specific: do not copy one between computers or commit it.

### Offline and privacy behavior

Once all runtime dependencies are installed, local startup, bundled UI/renderer assets and local chemistry work without external network access. Optional PubChem name lookup is a separate external request requiring the app's explicit consent; it will not work offline. First installation, explicit dependency updates and optional browser-test downloads need network access unless you separately provision a complete trusted local package/wheel source. An incomplete environment cannot bootstrap itself offline. `--setup-only` can be run while online to prepare a machine before disconnecting.

There are no required secrets. `.env.example` documents optional server resource settings at their defaults; **neither `serve.py` nor the launcher automatically loads `.env` files**. For example, to set one variable for your shell session:

```sh
# Linux/macOS
export BOND_ATLAS_WORKERS=2
python3.13 run_local.py
```

```powershell
# Windows PowerShell
$env:BOND_ATLAS_WORKERS = "2"
py -3.13 run_local.py
```

Keep real local configuration/credentials out of version control and Docker build contexts. The ignore files explicitly retain the nonsecret `.env.example`; they are safeguards, not a substitute for reviewing files before publication. No application data is saved merely by stopping the server: export any structures/results you want to keep before closing the app.

## Manual venv route (no launcher required)

Use a fresh dedicated directory, or inspect an existing one before reusing it. These commands deliberately use the environment's executable directly, so activation and PowerShell execution-policy changes are unnecessary.

Linux / macOS:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install --no-input -r requirements.txt
.venv/bin/python serve.py --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --no-input -r requirements.txt
.\.venv\Scripts\python.exe serve.py --host 127.0.0.1 --port 8000
```

Stop with Ctrl+C. Check **http://127.0.0.1:8000/api/v1/health** for a JSON health response. Installer diagnostics may include private proxy/index configuration: do not paste them publicly without redacting secrets. If Python reports missing `venv`/`ensurepip`, follow your distributor's Python 3.13 setup instructions yourself. If RDKit/Pillow/NumPy cannot import, verify supported wheels/native libraries for your platform; the launcher does not install OS libraries or silently change pins. Consider the optional container route if native wheels are unavailable.

## Updating and stopping

1. Export any results you want to keep, then stop this app with Ctrl+C in its terminal. Do not stop unrelated processes using port 8000.
2. Review incoming changes, then update your checkout with your normal Git workflow (`git pull --ff-only` when appropriate), or extract a new source archive into a separate directory. Do not overwrite uncommitted work.
3. Run `python3.13 run_local.py --install` (Windows: `py -3.13 run_local.py --install`) to explicitly synchronize runtime pins and restart. If dependencies did not change, a normal launcher invocation is sufficient and avoids pip/network access.

Manual-route users update packages with their venv's `python -m pip install --no-input -r requirements.txt` while the server is stopped, then start `serve.py` again. If the supported Python version changes in a future release, create a new environment with that release's documented Python; do not upgrade/overwrite the old environment in place. The app runs in the foreground, with no auto-start service or background daemon installed.

## Optional Docker route

Docker is an alternative, not a launcher prerequisite. Install Docker yourself if wanted. The existing Dockerfile uses Python 3.13, installs native runtime libraries **inside the image**, installs runtime requirements, and runs as a non-root user. Building needs network access to fetch the base image, OS packages and Python packages. From the project directory:

```sh
docker build -t orgchem-visualizer-local .
docker run --rm --name orgchem-visualizer-local -p 127.0.0.1:8000:8000 orgchem-visualizer-local
```

The server binds all interfaces **inside** the container, while this host port mapping remains loopback-only. Stop with Ctrl+C; from another terminal, `docker stop orgchem-visualizer-local` stops only this named container. For a different host port, use `-p 127.0.0.1:8001:8000`. Rebuild after updating source. This is local use, not a hosting deployment. Docker build/run has not been verified in the implementation environment because Docker is unavailable there.

## Optional regression tooling and CI

Launcher tests need only Python's standard library:

```sh
python3.13 -m unittest -v backend.test_launcher
```

For the broader Python/browser tests, explicitly install `requirements-dev.txt` into a dedicated venv. It includes runtime requirements plus pinned pytest, httpx and Playwright. Download Chromium separately with that venv's `python -m playwright install chromium`; this is never part of normal app setup. Native browser libraries must already be present or be installed by you according to your platform's instructions. Keep the browser sandbox enabled. Do not work around missing dependencies by disabling sandboxing or changing host security controls.

Node 22 is used only for the repository's optional JavaScript regression scripts; there is no npm dependency installation or Node runtime requirement for the app. See README for the full chemistry/browser regression commands.

`.github/workflows/ci.yml` uses known `actions/checkout@v4`, `actions/setup-python@v5` and `actions/setup-node@v4` versions with read-only repository permissions and no deployment credentials:

- Ubuntu 24.04 / Python 3.13: launcher plus the five backend suites, all `test.js` / `test-*.js` scripts on Node 22, and a launcher runtime check. Timeout: 20 minutes.
- Windows/macOS: stdlib launcher controls and CLI help only; no POSIX pipe-fault-injection tests or claim of native chemistry coverage. Timeout: 10 minutes each.
- Ubuntu 22.04: sandboxed Chromium smoke, integration and UI/localization suites (`browser_ui.py --url`), with a new loopback server process for each suite so production request limits remain unchanged. Each script has a six-minute bound; the job has a 25-minute bound. Only the job's own server is terminated during cleanup. No system packages or security policies are changed by the workflow.

**Verified locally:** Linux x86-64 under WSL2 with Python 3.13.18. Launcher controls have stdlib-only tests. A temporary Git-format repository was cloned with no inherited `.venv`; the cloned launcher created a fresh environment, installed the pinned runtime, and started successfully from an unrelated working directory. Its health/document, localization assets, local fonts, stereoisomer enumeration and conformer generation passed real HTTP checks. Ctrl+C cleanup released only that test listener. This temporary test fixture did not initialize, commit or publish the working project and did not invent project history.

**Verification limits:** Windows/macOS native chemistry and GitHub-hosted workflows have not been executed here. The CI browser job assumes its Ubuntu runner already has compatible native browser libraries and permits Chromium's sandbox; a failure must be addressed without weakening security. Native wheel availability on other OS/CPU combinations and Docker execution are not yet verified. Automated UI checks supplement rather than certify native-speaker or manual assistive-technology review.

## Publication boundary

The application source uses the [MIT License](LICENSE); bundled libraries/fonts retain their [third-party licenses](THIRD_PARTY.md). Local-run packaging does not create a GitHub repository, push code or deploy a server. Before publication, review ignored/untracked material and confirm the intended repository destination, visibility and authenticated access. GitHub CLI and Docker are not configured in the development environment; no remote resources have been created. Local clone verification, when reported, uses an isolated temporary test repository rather than publishing or inventing project history.
