# Orgchem Visualizer

Organic Chemistry visualizer

A textbook-style chemistry website: **structure → possible stereoisomers → conformers → linked representations**. The interface is vanilla JavaScript with 3Dmol.js; authoritative chemical parsing, stereochemistry and conformer calculations run in RDKit behind a same-origin FastAPI service.

Application source: **[MIT License](LICENSE)**. Bundled libraries/fonts keep their own [third-party licenses](THIRD_PARTY.md).

The product is now named **Orgchem Visualizer**. Existing `bond-atlas/2` and `bond-atlas/3` formats and internal compatibility identifiers are retained, so the rename does not invalidate saved chemistry files.

## Run locally

### Windows: first run with Command Prompt

The app runs on your own PC and opens in a browser such as Edge, Chrome or Firefox. You'll need **Python 3.13** and internet access for the first installation. You don't need Git, Node.js, Docker or an API key.

1. **Install Python 3.13.** Get the [Python install manager for Windows](https://www.python.org/downloads/windows/) and install it. Open the Windows **Start** menu, type `cmd`, and select **Command Prompt**. Type each line below and press **Enter**. If you already have Python, try the second line first; if it reports `Python 3.13.x` (where `x` is a number), you're ready.

   ```bat
   py install 3.13
   py -3.13 --version
   ```

2. **Download and unpack the app.** On the [Orgchem repository](https://github.com/Roflu999/Orgchem), choose **Code → Download ZIP**. In File Explorer, right-click the downloaded ZIP, choose **Extract All…**, then **Extract**. Open the extracted folders until you see `run_local.py` alongside `requirements.txt` and the `vendor` folder. Keep the whole folder together; don't double-click the HTML file.

3. **Start the app from that folder.** In that File Explorer window, click the **address bar** (not the search box), type `cmd`, and press **Enter**. This opens a Command Prompt in the right folder, even if its path contains spaces. Run:

   ```bat
   py -3.13 run_local.py
   ```

   On first run, the launcher creates a `.venv` folder for this app and installs the packages in `requirements.txt`, including RDKit. This can take several minutes with no new output. You don't need to run `pip` or activate anything yourself.

4. **Open the workspace.** When Command Prompt prints `Orgchem Visualizer: http://127.0.0.1:8000`, open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser. No tab opens automatically. You should see the model workspace; try **Move an oxygen** to compare ethanol and dimethyl ether. Keep Command Prompt open while using the app. That address works only on the computer running it.

**Stop and restart:** Export any work you want to keep. Click the Command Prompt window running the app and press **Ctrl+C**. Closing the browser alone doesn't stop it. To start again, repeat steps 3 and 4 using the same extracted folder. A normal restart reuses the installed packages without another download.

**If something goes wrong:**

| What you see | What to do |
| --- | --- |
| `py` isn't recognized, or Python 3.13 isn't found | Open a new Command Prompt after installing the Python install manager, then repeat step 1. If `python --version` already reports `Python 3.13.x`, you can use `python run_local.py` instead. Other Python versions won't run this launcher. |
| Python says it can't open `run_local.py` | Type `dir run_local.py`. If the file isn't listed, return to the **extracted** folder containing it and open Command Prompt from its address bar. |
| Runtime installation failed | Check your internet connection and free disk space, then run `py -3.13 run_local.py --install`. If it still fails, see [Local setup](LOCAL_SETUP.md) for manual diagnostics; compatible packages must be available for your OS and processor. |
| Port 8000 is in use, or the browser can't connect | Check that the command is still running and that you opened the printed **http** address. If the server exited because the port is busy, run `py -3.13 run_local.py --port 8001` and open [http://127.0.0.1:8001](http://127.0.0.1:8001). |

### macOS and Linux

Install Python 3.13 with `venv` support. Download and extract the ZIP as above, then open a terminal in the folder containing `run_local.py`. If you prefer Git, use `git clone https://github.com/Roflu999/Orgchem.git` and `cd Orgchem` instead. Run:

```sh
python3.13 --version
python3.13 run_local.py
```

Open the printed address and stop with **Ctrl+C**, just as on Windows. See [Local setup](LOCAL_SETUP.md) for manual installation, updates, optional Docker and platform verification limits. The renderer and fonts are bundled, so local chemistry and viewing don't require internet access after setup. Optional PubChem lookups do.

## Interface languages and accessibility

The language selector supports **English, Español, Français, 简体中文, العربية, and Deutsch**. Arabic uses right-to-left interface layout while molecular drawings, atom maps, formulas, SMILES and coordinate data retain their scientific orientation. Language changes update labels in place: they do not regenerate molecules, change the selected conformer, cancel jobs, reset the camera or discard builder history.

**Display & accessibility** offers system/light/dark appearance, larger text, higher contrast and reduced motion. The OS reduced-motion preference is respected too, including automatic 3D rotation. Sketches are not saved by default. The 2D simulator offers a separate, opt-in local recovery copy.

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

## Model workspace

The landing page is a model canvas with an editable list alongside it (below it on phones). Enter an English compound name or SMILES; duplicate a row, replace the text, or hide it to compare up to eight models. Try `ethanol` and `dimethyl ether` in 2D, or `ethane` and `hexane` in 3D. Sketches are schematic. The 3D scene fits the **whole collection**, not each molecule individually: all visible models use one orthographic scale and the gaps between models have no chemical meaning.

Try **Move an oxygen** (ethanol and dimethyl ether), **Branch a chain** (pentane and 2-methylbutane), or **Look in a mirror** (the two enantiomers of lactic acid). Each starter replaces the list with two editable, selected molecules; **Undo** brings your list back. To compare a pair you entered yourself, show both rows and check their boxes. For the three curated pairs the models mark the part to look at; open **What changed?** for the explanation. Other pairs still work side by side, without an automatic claim about how they differ.

Use **Remove** on one row, or check several rows and choose **Remove selected**. **Select all** includes hidden molecules. **Undo** and **Redo**, next to the Molecules heading, step through the last 32 list changes: adding or duplicating rows, editing inputs, hiding or showing models, removing a batch, and applying an atom edit. One undo restores a removed group in its original order and visibility. A fresh edit clears redo. Outside text fields, use Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or Ctrl+Y to redo; inside a field, native text editing shortcuts are preserved.

To remove atoms from a model, choose **Edit atoms** on its row. Use **Erase** for one atom, or choose **Select atoms**, tap the atoms (or Tab to each and press Space), then **Delete selection**. Attached bonds are removed too. **Undo** restores the whole batch in the sketch. **Apply to molecule** updates the originating row. To see a before-and-after instead, choose **Keep original and compare**: it puts the changed structure beside the original as a new row. **Back without applying** discards the edit. If no atoms remain, the apply button explicitly offers to remove the molecule instead.

Expand **Measurements** on a generated row for bond lengths and the largest atom-center separation, including hydrogen, in ångströms. These are calculated distances for that conformer, not experimental measurements or a surface diameter. Unsupported geometry, disconnected fragments and unspecified stereochemistry do not receive invented lengths. Editing a row clears its old measurements immediately. Local 2D previews work without the server; generating checked 3D coordinates needs the same-origin RDKit service. 

**Save to a local folder:** Open **Model workspace → Workspace files**, or choose **Save or open a workspace…** from the reaction plates. Use **Save as…** to choose a folder and filename. If the browser only offers **Download workspace**, it uses the browser’s downloads folder; enable “ask where to save each file” in browser settings to pick another. No GitHub account or cloud storage is involved. Saving is explicit, not automatic.

Use **Open workspace…** to restore the models and reaction plates together: row inputs (including applied sketch edits), order, visibility, selection, 2D/3D mode, plate contents, and each product’s origin. Opening replaces the current models and plates; **Undo** immediately restores both. Files made in v3.4.0 open with an empty plate rack. Restoring structures may use the chemistry service on the site you opened; run the app locally to keep that processing on your computer. The file stores the workspace, not calculated geometry or an unapplied sketch; 3D coordinates are recalculated as needed. Sketchpad draft recovery and single-molecule MOL/SDF export are separate.

## Reagents and electron flow

Open **Reagents**, enter a starting molecule, choose a reagent and **Conditions**, then select **Run reaction**. Reagents that match the structure appear first. Try bromoethane (`CCBr`) with hydroxide: warm aqueous conditions favour substitution to ethanol; hot ethanolic conditions favour elimination to ethene. These are the pathways emphasised at A level, not exclusive products. Choose **Use organic product as starting molecule** to continue with a supported product without changing the model workspace. For example, oxidise the ethanol and compare distilling off ethanal with heating under reflux with excess oxidant to form ethanoic acid. **Browse worked examples** opens a substrate, reagent and matching setup together. **Next step** is manual; **Play steps** is optional and respects reduced motion. Products, intermediates and explanations are in English. No reagent is applied to, or consumed from, the model desk.

**Cambridge International 9701 reaction plates:** Open **Reagents → Reaction plates**. Add a worked pair, or prepare a substrate and reagent separately. Choose aqueous, ethanolic or no added solvent; select the two plates and conditions, then **Check pathways → Create product plate**. The new plate holds the selected isolated organic product and records its parents. Both parents remain unchanged, so you can collect a different branch or use the child in another reaction. The rack holds up to 48 plates. A product’s history keeps both immediate parents, the conditions, and the chosen pathway even if you remove a parent. Choose **Compare with starting molecule** on a product to inspect before and after without changing the model workspace. Save your workspace file to keep the rack between sessions. A solvent or catalyst can also be prepared separately: for example, combine a hydrogen reagent plate and a nickel catalyst plate at room temperature to make a prepared reagent plate, then pair it with propene and select heat.

**Trace a product:** Choose **Distil ethanal from ethanol**, add the example plates and collect ethanal. For the next reaction, select that *ethanal plate* with the same reagent, choose **Heat under reflux**, check pathways and collect the acid. On the acid plate, open **Trace route**: the first step takes ethanol to ethanal; the second takes ethanal to ethanoic acid. Open **Step details** for structures, medium and any recorded reagent preparation. The trace reads the rack; it does not run another reaction or change the model desk.

**Compare two routes:** From the *same ethanol plate*, collect one product under distillation and another under reflux. Open **Compare routes** on either product. The shared plate comes first, followed by what differed at the fork and the two endpoints. A separately added ethanol plate, a repeated collection under identical conditions, or a later step along the same route is not a fork.

To see what survives removal, save the workspace before removing the ethanal plate. The acid still records ethanal as its immediate parent, but its trace stops there. Another plate of ethanal cannot fill that gap. Reopen the saved workspace for both steps; **Undo** the file open to return to the shorter trace.

The ten worked pairs include two ways to oxidise a primary alcohol: distil off the aldehyde or reflux with excess oxidant to form the carboxylic acid. Other pairs include borohydride reduction of propanone and cyclohexanone, nickel-catalysed hydrogenation of propene and reduction of a nitrile to an amine. Water and methane can be selected by name or entered as `H2O` and `CH4`; water is a reagent in acyl chloride hydrolysis and a solvent in aqueous substitution. Methane is an organic substrate in the UV chlorination example, not a catalyst. These are illustrations of selected syllabus chemistry, not a complete reaction or mixture predictor.

**Inspect a structure:** Open a plate or the guide's starting structure and focus on an atom or region in the 2D drawing without waiting for 3D. The degree of unsaturation (DBE) compares the formula with its saturated, acyclic counterpart: one unit means two fewer hydrogen atoms. Either a ring or a double bond can account for one unit; DBE alone doesn't tell you which. Choose **Show 3D** to request one verified conformer, then drag or use the arrow keys to rotate.

**Size limits:** With the local RDKit service, the guide accepts up to 256 base atoms (explicit hydrogen vertices count; generated display hydrogens do not). The offline interpreter still has a 64-heavy-atom limit. Eligible acyclic site transformations now use the larger budget for both parent and product; other rules can have tighter limits. Plate borohydride reduction also covers selected cyclic and aryl aldehydes/ketones, without assigning the new stereocentre. A structure may be viewable even when no reaction matches. Unresolved stereochemistry, a failed conformer calculation or unavailable WebGL leaves the 2D drawing available.

**Study a mechanism:** Select an AQA 7405, Cambridge International 9701, Pearson Edexcel UK 9CH0, IB core, IB HL, or Olympiad reading list. Each filters **Browse worked examples**, not which reactions the simulator will allow. Open a lesson to see its diagnostic feature, mechanistic reasoning and a common mistake alongside the worked reaction. The IB lists refer to first assessment 2025. These are selected study topics, not complete or endorsed syllabuses. The Olympiad list includes original multi-part problems with optional hints, worked solutions and buttons to try the relevant chemistry; isotope and analytical data in the questions are paper exercises, not simulated measurements.

**Compare reaction sites:** Try **Eliminate from 2-bromobutane**. Choose but-1-ene, (E)-but-2-ene or (Z)-but-2-ene and open the numbered parent diagram to identify the carbon losing H. The numbers are diagram IDs, not IUPAC locants. For larger starting molecules, the site map initially shows the area around the selected reaction site rather than shrinking the whole parent to fit. Equivalent sites share a product; their individual positions remain selectable. **Oxidise one end of an asymmetric diol** instead to make either mono-oxidised product, then use that product as the next starting molecule and react the other OH. The guide also compares direct addition orientations for supported internal alkenes and one-site-at-a-time reductions of isolated carbonyls or bromine additions to isolated alkenes. It does not assign yields, handle every functional-group interaction, or infer missing stereochemistry.

The original mechanism collection follows [AQA A-level Chemistry 7405](https://filestore.aqa.org.uk/resources/chemistry/specifications/AQA-7404-7405-SP-2015.PDF), not a claim of universal exam-board coverage:

| AQA section | Mechanisms represented |
|---|---|
| 3.3.2.4 | Alkane chlorination: initiation, two propagation steps, termination |
| 3.3.3.1–2; 3.3.11.3 | Haloalkane substitution with hydroxide, cyanide, ammonia and amines up to a quaternary salt; competing elimination |
| 3.3.4.2; 3.3.5.1, 3.3.5.3 | Alkene addition with HBr, bromine or sulfuric acid; acid-catalysed hydration and alcohol dehydration |
| 3.3.5.2 | Alcohol oxidation: primary to aldehyde or acid, secondary to ketone; no oxidation of tertiary alcohols under these conditions. These are net transformations, not elementary mechanisms. |
| 3.3.8 | Carbonyl addition of hydride or cyanide followed by proton transfer |
| 3.3.9.2; 3.3.11.3 | Acyl chloride addition–elimination with water, alcohol, ammonia or primary amine; anhydride examples also available |
| 3.3.10.2 | Benzene nitration and Friedel–Crafts acylation, including electrophile generation and recovery of aromaticity |

The matcher tests molecular graphs rather than names; its scope is small neutral molecules, not arbitrary polyfunctional substrates or a general reaction predictor. Curly arrows track electron pairs; single-barbed fishhooks track individual electrons. An elementary step is distinct from a net equation (sulfate ester hydrolysis is shown only as a net transformation). Curves show formal electron accounting, not measured electron trajectories.

For unsubstituted benzene, the 2D model desk and the starting-molecule frame in Reagents offer **Kekulé A/B**, **π electrons**, and **π electron cloud**. Dot pairs show one resonance contributor; the two cloud regions show delocalised density above and below the ring plane. Neither switching contributors nor stepping through the mechanism changes the electronic calculation: these are explanatory drawings, not quantum-density calculations.

## Linked textbook views

Switch the selected state among **3D model** (ball & stick), **2D structure** (skeletal), **All atoms** (displayed), **Condensed**, **Formula**, **Fischer**, and **Newman**.

- **2D:** The skeletal view uses line-angle notation and RDKit stereo-aware depictions. Try **cis-But-2-ene (Z)** and **trans-But-2-ene (E)** under **Stereo & conformers**. For four different substituents, use E/Z rather than cis/trans. An unassigned alkene is not given a configuration just because of how it was sketched. The displayed view includes hydrogens.
- **Fischer:** mapped local views preserve the selected configuration. Suitable simple acyclic chains support multi-center projections. Horizontal bonds point toward the viewer, vertical bonds away. Local layouts prefer a vertical carbon backbone and recognizable labels such as COOH and OH while re-verifying parity. A configuration inversion must select a different state rather than silently redrawing the same one.
- **Newman:** front/rear groups and the measured dihedral derive from the selected conformer. The advanced projection controls can apply a constrained dihedral to an eligible bond and select the new checked conformer. Native JSON and coordinate-only builder edits retain validated torsion settings and parent linkage while that parent remains in the ensemble. Ring, terminal, aromatic and conjugated bonds cannot be arbitrarily twisted by that operation.
- **Condensed:** hydrogens are grouped with bonded atoms; ring/multifragment cases that would be misleading remain in structural views.
- **Molecular formula:** atom counts alone do not define connectivity or a unique stereoisomer.

Legacy offline examples remain available and are explicitly schematic, not assigned-stereo conversions. Geometry-linked views use the RDKit record. Unsupported projections explain why instead of changing the molecule to fit.

## Molecule builder

For a ten-minute student lab and a repeatable visual review, see [Student walkthrough](STUDENT_WALKTHROUGH.md). The simulator keeps notes about editing, angle measurements, and cis/trans examples under **How to read this view**.

**2D simulator** opens a drag-and-drop sketchpad with single/double/triple bonds, benzene stamps, moving, deletion, Undo/Redo and explicit H. Click an element then tap to place/replace, or drag it from the palette. Choose a bond and drag between two atoms or tap both. Move mode drags atoms; dragging a bond moves both ends.

Under **Move tool · 2D angles**, choose **Free** for arbitrary angles or **Idealized chain ends** for conventional line-angle drawings. The latter snaps an eligible terminal bond at a two-bond carbon to a 120° zigzag or a linear 180° arrangement. Rings and junctions are not forced into these angles. To find an angle for a specific 3D shape, measure it in a conformer instead.

Choose **Elastic drag** and pull an atom (or focus it and press an arrow key) to see bonded neighbors follow. The springs use the drawing’s bond lengths; this is a layout simulation, not a molecular-energy calculation. **Move** still repositions just the selected atom or bond.

Use **View in 3D** to preview the selected structure, then **Edit in 2D** to return to your drawing and Undo history. For a different selected model, **Edit in 2D** opens its corresponding sketch instead. Toolkit structures reuse supplied coordinates or request one conformer when eligible; unassigned stereochemistry is not guessed.

On wider screens, **Side by side** docks the viewer beside the sketch. Pick an atom with the Move tool to highlight its counterpart, or select atoms in the model. Two picks give the distance; three give the angle at the second atom. These values use model coordinates, not distances on the screen. The inspector identifies whether the source is a conformer or an illustrative offline model. Hydrogens added only for 3D have no sketch counterpart. After editing, **Update preview** reconnects the panes; the previous model cannot be measured while out of date.

The default neutral C/H/N/O/halogen editor remains usable offline. **More elements** / toolkit mode supports periodic-table symbols, isotopes and signed formal charges with RDKit-authoritative valence validation. Imported v3 structures retain their source record, atom/bond IDs and assigned stereochemistry. Position-only edits do not change configuration; chemical neighborhood changes explicitly invalidate affected assignments and stale conformers, with warnings. Old asynchronous responses cannot overwrite a newer draft.

Disconnected legacy drawings are separate scene structures. Imported salts/multifragment toolkit molecules stay grouped as one chemical record. Arbitrary interfragment positioning is not an optimized molecular assembly.

Drafts stay in memory across workspace switches. Enable draft recovery to keep a local copy, including unfinished drawings. On reopening the simulator, choose **Restore draft** or discard the copy; turning recovery off removes it. Export a file for long-term storage or sharing. **Ideal bond angles** is a legacy 2D layout operation; toolkit depictions and generated conformers use their own authoritative geometry. A flat sp³ zigzag is a projection, not a literal 109.5° tetrahedron.

## Reading an unfamiliar structure

Paste `N#CCC1CC(O)CC1` as SMILES and open **Reading the structure → Inspect the evidence** below the viewer. No compound name is needed. The nitrile is recognized from a carbon–nitrogen triple bond; the alcohol from an O–H attached to saturated carbon. The panel reports one independent ring and, under RDKit’s hydrogen-bond rules, one potential donor site and two acceptor sites. Atom IDs in the evidence correspond to **Text description of this molecule**. No external naming service is queried.

Motif rules recognize local bonding patterns, not every functional group. A missing match is not proof that a molecule lacks functional groups. Donor/acceptor counts describe potential sites, not observed interactions or measured solubility. Counts are withheld outside the supported neutral organic model. Offline formula candidates instead show the ring and multiple-bond contributions and whether O–H or N–H sites are present. For example, try `C2H6O` and switch between the alcohol and ether: the atom counts agree but the hydrogen-bond evidence changes. The formula on its own cannot choose between them.

## Names and electron illustrations

Formula, mapped identifiers and isomeric SMILES are available independently of a name. In the explorer, enter an English name such as `3-methylhexan-2-ol` or `acetone` to open its structure. Supported systematic names are assembled from the parent chain, locants and substituents. In the other direction, the viewer derives **connectivity-only systematic names** for supported acyclic structures (up to 12 carbons, simple alkyl/halogen branches and at most one supported principal group or multiple bond). Assigned stereochemistry remains separate; neither direction provides universal IUPAC coverage. See [name input and limits](NAMING.md). A small offline name set supplies familiar examples; **Look up a database name** optionally sends the selected isomeric SMILES to PubChem only after explicit consent. A returned name is used only for an exact charge/isotope/stereo identity match. No approximate database name is silently substituted. Remote availability and database coverage are not guaranteed.

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

Enter `C4H6` and open **Follow the deduction**. Four carbons in an open, single-bonded structure could hold ten H. Six H leave two units to account for: two double bonds, a triple bond, a ring and a double bond, or two independent rings. The worker builds two distinct single-bond skeletons, finds five arrangements after one added bond unit, then nine after two. These counts come from that search, before any sidebar filter; the results are not fetched from a stored formula-to-structures list. Only generic tree shapes are reused. **Go to structures** moves keyboard focus to the results.

The worker enumerates connected neutral, closed-shell constitutional bond graphs under this model: C(4), N(3), O(2), halogens(1), carbon required. Limits: 12 heavy atoms at DBE 0; 10 at DBE 1; 9 at DBE 2; 7 at DBE 3–4. Searches stop at 22 seconds or over 12,000 candidates without labeling partial results complete. This feature is separate from opening a larger supplied toolkit structure or enumerating its stereo assignments.

Known counts retained by regression tests include C₂H₆O = 2, C₄H₁₀O = 7, C₄H₉Br = 4, C₈H₁₈ = 18, C₁₀H₂₂ = 75, C₁₂H₂₆ = 355. The reactivity/strain penalty is an educational structural heuristic, never a thermodynamic stability or safety assessment.

## Verification

For a task-by-task assessment of how easy the workspace is to use, see the [usability and visual clarity report](UI_CHECK.md). For the lightweight live interaction check against the local server, see [DOM check setup and scope](BROWSER_CHECK.md). It exercises the formula and naming flows without claiming to test pixels, WebGL or native screen-reader behavior.

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
