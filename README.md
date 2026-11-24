# Orgchem Visualizer

Organic Chemistry visualizer

A textbook-style chemistry website: **structure → possible stereoisomers → conformers → linked representations**. The interface is vanilla JavaScript with 3Dmol.js; authoritative chemical parsing, stereochemistry and conformer calculations run in RDKit behind a same-origin FastAPI service.

Application source: **[MIT License](LICENSE)**. Bundled libraries/fonts keep their own [third-party licenses](THIRD_PARTY.md).

The product is now named **Orgchem Visualizer**. Existing `bond-atlas/2` and `bond-atlas/3` formats and internal compatibility identifiers are retained, so the rename does not invalidate saved chemistry files.

## Run locally

Use **Python 3.13** and a modern browser. No chemistry API key, Node/npm installation, or cloud account is needed to run the app.

```sh
git clone https://github.com/Roflu999/Orgchem.git
cd Orgchem
python3.13 run_local.py
```

On Windows: `py -3.13 run_local.py`. The first run explicitly creates an isolated `.venv` and installs pinned runtime dependencies, so it needs network access to a Python package index. Subsequent successful runs do not invoke the installer. Existing environments are inspected, never erased or silently upgraded. Open **http://127.0.0.1:8000** and stop with Ctrl+C. Use `--port 8080` for another loopback port.

See **[Local setup](LOCAL_SETUP.md)** for fresh-clone commands, Windows/macOS/Linux instructions, manual virtual-environment setup, updates, optional Docker, and verification limits. Node and Playwright are optional development/test tools only. Do not open the HTML through `file://`: the Python server supplies the app and chemistry API together.

The pinned 3Dmol.js renderer and all interface fonts—including Latin, Arabic and Chinese subsets—are vendored with their licenses. The interface makes no font-CDN requests and remains usable offline after runtime dependencies have been installed. Calculations use **this website’s server**, not a third-party chemistry API. See [third-party notices](THIRD_PARTY.md).

## Interface languages and accessibility

The language selector supports **English, Español, Français, 简体中文, العربية, and Deutsch**. Arabic uses right-to-left interface layout while molecular drawings, atom maps, formulas, SMILES and coordinate data retain their scientific orientation. Language changes update labels in place: they do not regenerate molecules, change the selected conformer, cancel jobs, reset the camera or discard builder history.

**Display & accessibility** offers system/light/dark appearance, larger text, higher contrast and reduced motion. The OS reduced-motion preference is respected too, including automatic 3D rotation. Only these per-browser preferences are stored; molecular drafts are not autosaved.

- Use the skip link or **Go to molecule** to move into the workspace/viewer.
- Focus a 3D model: arrow keys rotate, `+` / `−` zoom, and `Home` resets. Visible zoom buttons are also provided; Tab leaves the model normally.
- Representation tabs support arrow keys and Home/End, with direction-aware navigation in Arabic.
- The builder supports keyboard atom/bond activation, movement, deletion and Undo/Redo; the preferences dialog contains a keyboard guide.
- Each selected molecule has a text description and an atom/connectivity listing. Controls have accessible names, native dialogs keep focus, and computation/status information remains available without relying only on color.

Names, chemical identifiers, scientific SVG labels and unmatched server diagnostics remain as supplied. Unmatched technical details and the detailed scientific scope are clearly identified as original-language material; interface translations never reinterpret chemistry. Automated catalog, contrast, keyboard, state-preservation and reflow checks supplement—not certify—native-speaker and manual assistive-technology review.

## Learner workflow

### 1. Choose a structure

Open **Stereo & conformers**. Start with lactic acid, but-2-ene, butane-2,3-diol or an explicitly assigned example, or use the selected structure. SMILES supports aromatic lowercase, charges, isotopes, explicit H and supported stereochemical syntax. MOL/SDF V2000/V3000 and mapped Orgchem Visualizer v3 JSON are supported through **Paste / import file**.

### 2. Compare stereoisomers

**Generate possible stereoisomers** enumerates unassigned supported tetrahedral and double-bond configurations. Specified configurations are preserved unless **Enumerate all** is explicitly checked. Results carry R/S and E/Z assignments, stereo-aware identity and stable atom maps; meso/symmetry duplicates are removed. Examples: lactic acid → 2; but-2-ene → 2; butane-2,3-diol → 3, not 4.

Select a variant for the viewer or compare two side by side. A distinct stereoisomer is not a new conformation. Counts are labeled complete, capped or unsupported; capped output is never called exhaustive. Embedding failure is not used as evidence that a valid stereoisomer cannot exist.

### 3. Explore conformers

Generate a seeded **ETKDGv3** ensemble, then select a conformer. If stereochemistry is unspecified, first enumerate possibilities and select a configuration; the app refuses to silently mix different stereoisomers into one conformer ensemble. The service uses MMFF when fully parameterized, otherwise an explicitly labeled UFF fallback when supported. If neither is applicable, geometry can be returned without invented energies. Every accepted generated conformer is independently checked against the selected stereochemistry.

Methods, energy units, relative energies, convergence, seed and warnings remain explicit. Relative energies compare only the same molecular state and force-field method; they are not experimental stability, equilibrium populations, or rankings between stereoisomers. Sampling is not exhaustive over continuous conformational space. Imported 3D conformers are retained.

**Together** lays out selected structures in a shared 3D scene. Scene placement does not add bonds or model molecular interactions. Starting conformers can be generated for a comparison that lacks 3D coordinates. Use the ensemble controls for broader conformational sampling.

## Linked textbook views

Switch the selected state among **3D model** (ball & stick), **2D structure** (skeletal), **All atoms** (displayed), **Condensed**, **Formula**, **Fischer**, and **Newman**.

- **2D:** RDKit stereo-aware depictions retain wedge/hash information. Displayed views include hydrogens.
- **Fischer:** mapped local views preserve the selected configuration. Suitable simple acyclic chains support multi-center projections. Horizontal bonds point toward the viewer, vertical bonds away. Local layouts prefer a vertical carbon backbone and recognizable labels such as COOH and OH while re-verifying parity. A configuration inversion must select a different state rather than silently redrawing the same one.
- **Newman:** front/rear groups and the measured dihedral derive from the selected conformer. The advanced projection controls can apply a constrained dihedral to an eligible bond and select the new checked conformer. Native JSON and coordinate-only builder edits retain validated torsion settings and parent linkage while that parent remains in the ensemble. Ring, terminal, aromatic and conjugated bonds cannot be arbitrarily twisted by that operation.
- **Condensed:** hydrogens are grouped with bonded atoms; ring/multifragment cases that would be misleading remain in structural views.
- **Molecular formula:** atom counts alone do not define connectivity or a unique stereoisomer.

Legacy offline examples remain available and are explicitly schematic, not assigned-stereo conversions. Geometry-linked views use the RDKit record. Unsupported projections explain why instead of changing the molecule to fit.

## Molecule builder

**Build a molecule** opens a drag-and-drop sketchpad with single/double/triple bonds, benzene stamps, moving, deletion, Undo/Redo and explicit H. Click an element then tap to place/replace, or drag it from the palette. Choose a bond and drag between two atoms or tap both. Move mode drags atoms; dragging a bond moves both ends.

The default neutral C/H/N/O/halogen editor remains usable offline. **More elements** / toolkit mode supports periodic-table symbols, isotopes and signed formal charges with RDKit-authoritative valence validation. Imported v3 structures retain their source record, atom/bond IDs and assigned stereochemistry. Position-only edits do not change configuration; chemical neighborhood changes explicitly invalidate affected assignments and stale conformers, with warnings. Old asynchronous responses cannot overwrite a newer draft.

Disconnected legacy drawings are separate scene structures. Imported salts/multifragment toolkit molecules stay grouped as one chemical record. Arbitrary interfragment positioning is not an optimized molecular assembly.

Drafts stay in memory across workspace switches, not across a reload. Export to save chemistry and conformers. **Ideal bond angles** is a legacy 2D layout operation; toolkit depictions and generated conformers use their own authoritative geometry. A flat sp³ zigzag is a projection, not a literal 109.5° tetrahedron.

## Names and electron illustrations

Formula, mapped identifiers and isomeric SMILES are available independently of a name. RDKit is not a universal IUPAC name generator. A small offline name set supplies familiar examples; **Look up a database name** optionally sends the selected isomeric SMILES to PubChem only after explicit consent. A returned name is used only for an exact charge/isotope/stereo identity match. No approximate database name is silently substituted. Remote availability and database coverage are not guaranteed.

**π clouds** are qualitative teaching surfaces for explicit alternating carbon six-rings and carbon multiple bonds. **Lone pairs** are symbolic paired-dot markers. Toolkit records use valence/formal-charge-based lone-pair counts where chemically supported; unsupported electron-domain models are not guessed. These are not quantum calculations or total electron densities. Classical C⁺ has an empty p orbital, not an occupied electron cloud. The limited illustration geometry has its own declared support/budget independently of broader molecule parsing.

**Import a calculated electron grid** can display a real, user-supplied single-channel Gaussian CUBE dataset: density or opposite-sign orbital-amplitude surfaces. Import the matching 3D molecular geometry first; atom types/coordinates must align within 0.03 Å, so a grid is never misleadingly overlaid on a different conformer. Files stay in the browser. The importer supports Bohr/Angstrom grid conventions, validates grid sizes/axes/numeric values, and limits data to 16 MB / 1,000,000 values. Multi-orbital bundles must be split into individual scalar files. This displays a supplied quantum dataset; the website does not calculate one.

## Import and export

Toolkit imports preserve supported formal charge, isotope, aromaticity, radicals, atom maps, specified stereo and supplied coordinates; no neutral-only normalization is applied. Unknown unsupported stereochemical classes or unrepresentable file features are reported. Standard tetrahedral/E/Z support is not a promise to enumerate every exotic axial, atropisomeric or coordination stereochemical class.

| Format | Preserved / scope |
| --- | --- |
| Isomeric SMILES | Molecular state and supported specified stereo; no conformer coordinates |
| MOL V2000/V3000 | Mapped selected structure and selected/supplied coordinates; default advanced export is V3000 |
| SDF | Selected/all structures, or selected structure’s conformers, with supported chemistry and coordinates |
| Orgchem Visualizer v3 JSON | Authoritative mapped molblock, chemical state, depictions, conformers, provenance and stereo identity |
| CSV | Structured identifiers and conformer/method/energy metadata; not a chemistry round-trip format |
| XYZ | Selected 3D coordinates only; no encoded connectivity, formal charge or stereo annotations |
| PNG | Selected 2D depiction; visual output only |

Repeated source records are retained rather than deduplicated only by connectivity. Legacy v2 neutral exports/imports retain their older restricted semantics; charge/stereo-bearing data is never silently routed through neutral writers. Text exports offer preview/copy with a clipboard fallback.

## Sorting

The constitutional-results sidebar offers ascending/descending **reactivity priority**, **isomer relationship**, **functional group**, **name** and **molar mass**. Change the reference with **Compare with selected structure**. Constitutional relationship labels are graph/group heuristics and may overlap. The stereo comparison uses the service to distinguish identical, enantiomeric and diastereomeric states where supported. Conformers are not classified as new stereoisomers.

## Website hosting choices

1. **Recommended: one long-lived container, one origin.** Serve the page, assets and API together on a container/VPS host. This fits the native RDKit dependency and cancellable process jobs, avoids CORS, and is simplest to operate. Configure HTTPS and a reverse proxy for public use.
2. **Static CDN + chemistry service.** Useful later when static traffic grows. Proxy `/api` through the same public origin, or deliberately implement a narrow CORS/origin allowlist. The current server intentionally rejects cross-origin chemistry submissions.
3. **Static-only hosting.** Can host the legacy offline functionality, but does not provide equivalent Python/RDKit stereo/conformer calculations.

A persistent container host (for example a suitable Render/Fly.io/VPS service) fits better than short-lived edge functions. Cloud autoscaling requires a shared job store/queue or sticky routing: jobs currently live in one process’s memory. Cloud Run requires deliberate CPU/background-job allocation and instance routing rather than assuming default request-only CPU is sufficient. No hosting account, domain or public deployment is created by this project.

```sh
docker build -t orgchem-visualizer .
docker run --rm -p 127.0.0.1:8000:8000 --memory=4g --cpus=2 orgchem-visualizer
```

The Docker definition is provided for deployment; build it in the target environment before release. Production binding is explicit (`--host 0.0.0.0` inside the container). Configure trusted reverse-proxy forwarding correctly; do not blindly trust forwarded headers from arbitrary clients.

### Resource and privacy controls

Jobs run in isolated, bounded worker processes, with real process termination for timeouts/cancellation. Process startup and result transport use a bounded I/O thread pool rather than blocking the server’s event loop; worker slots remain occupied until process and pipe cleanup finishes. Request payloads are bounded before parsing; the static server exposes an asset allowlist, not the repository or virtual environment. Raw molecule payloads are not logged by default. Job IDs are unguessable; results expire from temporary memory. Input records are not sent to naming services unless a user explicitly consents.

Defaults: 256 base atoms per toolkit molecule, up to 64 stereo results and 50 requested conformers, 1 MB HTTP input, 2 worker processes, 8 queued/running jobs, 45 seconds per active calculation, and temporary result expiry after 600 seconds. These are computational budgets, not silently enlarged claims of exhaustive chemistry.

Configuration: `BOND_ATLAS_WORKERS`, `BOND_ATLAS_QUEUE`, `BOND_ATLAS_TIMEOUT`, `BOND_ATLAS_JOB_TTL`, `BOND_ATLAS_MEMORY_MB`, `BOND_ATLAS_MAX_BODY`. Process-level CPU/address-space controls are strongest on POSIX; wall-clock cancellation applies on other hosts. For a public multi-user deployment, add an infrastructure-level rate limit/authentication policy and shared coordination before scaling across multiple application instances.

## Offline constitutional isomer explorer

The existing browser worker still enumerates connected neutral, closed-shell constitutional bond graphs under its original model: C(4), N(3), O(2), halogens(1), carbon required. Limits: 12 heavy atoms at DBE 0; 10 at DBE 1; 9 at DBE 2; 7 at DBE 3–4. Searches stop at 22 seconds or over 12,000 candidates without labeling partial results complete. This feature is separate from opening a larger supplied toolkit structure or enumerating its stereo assignments.

Known counts retained by regression tests include C₂H₆O = 2, C₄H₁₀O = 7, C₄H₉Br = 4, C₈H₁₈ = 18, C₁₀H₂₂ = 75, C₁₂H₂₆ = 355. The reactivity/strain penalty is an educational structural heuristic, never a thermodynamic stability or safety assessment.

## Verification

```sh
node test.js
node test-advanced-builder.js
node test-quantum-grid.js
node test-i18n.js
node test-preferences.js
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m unittest backend.test_chemistry_service backend.test_api backend.test_extras backend.test_jobs backend.test_composition backend.test_launcher -v
.venv/bin/python -m playwright install chromium
.venv/bin/python browser_smoke.py --url http://127.0.0.1:8000
.venv/bin/python browser_integration.py --url http://127.0.0.1:8000
.venv/bin/python browser_ui.py --url http://127.0.0.1:8000
.venv/bin/python browser_layered.py --url http://127.0.0.1:8000 --repeat 2
.venv/bin/python browser_layered.py --url http://127.0.0.1:8000 --mobile
```

The JavaScript suites cover legacy chemistry/editor/mesh behavior plus mapped builder metadata, async cancellation and stale responses. RDKit tests cover stereoisomer counts, meso deduplication, fixed/partial stereo, conformer verification, force-field fallbacks, projection parity/dihedrals, mapped editing and lossless round trips. API tests exercise actual worker processes, cancellation, bounded input, static asset restrictions and batch exports. Job lifecycle tests cover event-loop responsiveness during process startup and partial-result receipt, deadlines, cancellation and worker-slot cleanup. Browser tests require Chromium’s native libraries and intentionally enable its sandbox by default. They also exercise actual WebGL, mapped builder edits, selected-conformer JSON round trips and supplied-grid rendering. `browser_integration.py` adds those deeper workflows. `browser_layered.py` chains comparison/scene preparation and reselection, duplicate imported-source identities, superseded async scene work, conformer/projection/torsion/native-JSON operations, chemical edits with Undo, grid replacement and conformer changes, and delayed file reads superseded by newer pasted chemistry. It supports targeted `--case` runs, bounded repetition and phone-width dark-mode checks. Backend composition tests independently exercise selection precedence, nonfirst-state preservation, validated torsion provenance and charged/isotopic edit/export chains. The minimal Wolfi build environment required isolated native libraries/font setup and explicit permission to disable the **test browser** sandbox; this does not change production site security. For repeatable environment-specific launch checks, `/run-skill-generator` can capture that setup as a project run recipe.

`test-i18n.js` exercises in-place localization and pending-work ownership across the real UI modules. `test-preferences.js` checks combined catalog/interpolation parity, preference validation, text/control contrast and local font integrity/glyph coverage. `browser_ui.py` tests all six locales, RTL navigation, camera/scene preservation, modal focus, reduced motion, larger-text reflow, builder Undo and blocked-storage/network fallbacks. Use `--capture` when you also want full-page visual references; the functional checks do not depend on compositor snapshots.

## Main files

- `backend/chemistry_service.py`: authoritative RDKit parsing, records, stereo enumeration, conformers, projections and single-record serializers.
- `backend/app.py`, `models.py`, `jobs.py`, `exports.py`, `names.py`: HTTP contract, bounded jobs, batch output and opt-in naming.
- `chemistry-client.js`, `molecule-record.js`: same-origin transport, stable identities and conformer selection.
- `stereo-ui.js`, `stereo.css`, `workbench.css`: learner workflow and responsive linked-workbench layout.
- `bond-atlas.html`: shared views/state, 3Dmol scene and legacy explorer.
- `sketcher-model.js`, `sketcher-ui.js`: immutable legacy/toolkit drafts and builder integration.
- `projections.js`, `textbook-ui.js`, `orbitals.js`: textbook views, linked service projections and qualitative electron illustrations.
- `chemistry.js`, `chemistry-worker.js`, `geometry.js`, `scene.js`, `formats.js`: restricted offline compatibility functions.
- `serve.py`: same-origin server CLI; `Dockerfile`: production container definition.
