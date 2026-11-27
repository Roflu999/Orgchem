# v3.6.0: Trace and compare reaction routes

- **Compare routes** shows where two collected products diverged from the same recorded plate. Compare each branch’s reagent, medium, catalyst, condition and selected pathway with its own endpoint drawing. Matching names or structures alone never establish a shared route.

- Open **Trace route** on a collected product to follow its recorded reactions in order. Each step identifies both organic plates, the reagent, condition and selected pathway. Reagent preparation stays in the step details, not in the organic sequence.
- Removing an intermediate leaves its snapshot on its child. The trace stops at that plate rather than guessing earlier steps from a matching molecule. Save before removal to keep the complete route; reopening the file and undoing the open restore the corresponding traces. No workspace format change is needed.

## v3.5.0: Follow a reaction

- Compare a product plate with its starting molecule in 2D without changing the model workspace. Open **What changed?** for a supported transformation.
- Each collected plate records its immediate parents, conditions, and selected pathway. Removing a parent does not erase the child's record.
- Save the model workspace and reaction rack together in one local `.orgchem.json` file. **Save as…** lets you choose the folder where supported; **Download workspace** follows the browser's download settings. Older v3.4.0 files still open. Opening a workspace is undoable.

## v3.4.0: Reaction plates and molecular comparisons

- Combine two Cambridge International 9701 teaching plates and keep a selected product on a third. Ten worked pairs cover reductions, substitution, elimination and oxidation under distillation versus reflux. Parent plates remain available for a different pathway.
- Explore 32 reaction lessons across AQA, Cambridge, Edexcel, IB and Olympiad reading lists, with five original Olympiad problems. Supported multisite substrates expose equivalent sites, distinct products and E/Z alternatives rather than predicting yields.
- Inspect larger molecules with the local chemistry service (up to 256 base atoms). Focus on one atom in 2D or a verified 3D conformer, fit the whole molecule and see hydrogen deficiency where applicable.
- The README now walks a first-time Windows user from installing Python to opening the app. The sandboxed CI job includes the phone-width inspector check; see `UI_CHECK.md` for verification scope.

- **What changed?** highlights a structural difference for three curated pairs. Check two visible models to compare them, and open the explanation when you want it. Other pairs can still be explored side by side.
- **Move an oxygen**, **Branch a chain**, and **Look in a mirror** open editable pairs: ethanol/dimethyl ether, pentane/2-methylbutane, and the mirror forms of lactic acid. Undo returns to your previous list.
- **Keep original and compare** puts a changed sketch next to its source instead of replacing it. The new row is one undoable change.
- Save the workspace to a local `.orgchem.json` file and reopen it later. Files keep row order, input, visibility, selection and display mode. Use the download option in any supported browser or the native Save As picker where available. Opening a workspace is undoable; sketches are not automatically saved.

## v3.3.0: Molecule workspace and reaction mechanisms

- Compare up to eight molecules in a model-only canvas. In 3D, all molecules share one scale; bond lengths and molecular spans come from calculated conformer coordinates.
- Add, duplicate, hide or remove molecules individually or in batches. Edit atoms in the 2D sketcher and apply changes to the originating row. Undo and redo list changes or sketch edits.
- Open **Reagents** to match a starting structure to supported pathways. Step through 27 worked examples covering the AQA 7405 organic mechanism families and selected extensions, with products, intermediates and exam-style electron-flow arrows. Matches are not yield predictions.
- Compare the two Kekulé contributors of benzene, count its six pi electrons, or display the schematic delocalised electron cloud. The display choice does not change the molecule.

## v3.2.0: Student molecule simulator

- Sketch or edit a molecule in 2D, explore it in 3D, and return to the drawing. Desktop side-by-side mode links atom selection and flags out-of-date previews.
- Choose freehand or idealized chain-end angles. Select two model atoms for distance or three for the angle at the middle atom. Measurements identify the geometry source.
- Compare stereo-aware skeletal formulas for cis-, trans- and unspecified alkenes with E/Z annotations where assigned.
- Recover unfinished drawings on this device when opted in. Student exercises cover connectivity, sketch versus conformer angles, and stereochemistry; phone layouts put the drawing before advanced tools.

## Previous release: structure reasoning and chemical names

- Enter a molecular formula and open **Follow the deduction** to see how hydrogen counts, valence and bond order constrain the possible structures. Counts come from the current search, before filtering.
- Select a molecule and open **Reading the structure** to inspect the atoms and bonds behind recognized functional groups. Hydrogen-bond donor and acceptor counts describe potential sites, not measured properties.
- Enter familiar names or supported systematic names directly. With OPSIN 2.10.0 installed on the app server, names such as `(R)-butan-2-ol` and `(Z)-but-2-ene` open with their specified stereochemistry. No external name service receives the input. OPSIN reads names; it does not generate preferred IUPAC names from arbitrary structures.
- Use the keyboard to follow the deduction and move to the results. The new explanations support all six interface languages.

## Getting started

Run `python3.13 run_local.py` from the source checkout or unpacked source archive. The basic explorer does not need Java. For extended name input, follow `NAMING.md` to install the pinned Java runtime and checksummed Maven artifacts, then restart the server. `LOCAL_SETUP.md` covers the base installation and `BROWSER_CHECK.md` covers live interaction tests.
