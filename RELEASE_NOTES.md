# Orgchem Visualizer: structure reasoning and chemical names

- Enter a molecular formula and open **Follow the deduction** to see how hydrogen counts, valence and bond order constrain the possible structures. Counts come from the current search, before filtering.
- Select a molecule and open **Reading the structure** to inspect the atoms and bonds behind recognized functional groups. Hydrogen-bond donor and acceptor counts describe potential sites, not measured properties.
- Enter familiar names or supported systematic names directly. With OPSIN 2.10.0 installed on the app server, names such as `(R)-butan-2-ol` and `(Z)-but-2-ene` open with their specified stereochemistry. No external name service receives the input. OPSIN reads names; it does not generate preferred IUPAC names from arbitrary structures.
- Use the keyboard to follow the deduction and move to the results. The new explanations support all six interface languages.

## Getting started

Run `python3.13 run_local.py` from the source checkout or unpacked source archive. The basic explorer does not need Java. For extended name input, follow `NAMING.md` to install the pinned Java runtime and checksummed Maven artifacts, then restart the server. `LOCAL_SETUP.md` covers the base installation and `BROWSER_CHECK.md` covers live interaction tests.
