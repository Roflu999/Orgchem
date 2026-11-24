# v3.3.0: Molecule workspace and reaction mechanisms

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
