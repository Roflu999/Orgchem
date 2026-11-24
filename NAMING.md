# Entering a chemical name

In the Explorer, type `3-methylhexan-2-ol` or `acetone`, choose **Compound name**, or prefix the query with `name:`. The name opens one connected structure, not all the isomers of its formula. The import dialog accepts a single name as well. Known aliases and simple names are resolved in the browser. When the offline parser cannot read a name, the site can send that **name to its own server** for OPSIN parsing. No names go to an external naming service. The optional PubChem lookup in the reverse direction remains separate.

## OPSIN 2.10.0 (extended name input)

Choose **Compound name** and enter `(R)-butan-2-ol` or `(Z)-but-2-ene`. OPSIN converts a single name (up to 256 characters) to isomeric SMILES; RDKit constructs the displayed record. The submitted name is a label, not a certified preferred name. OPSIN supports many systematic names but is not universal IUPAC coverage and does not generate names from structures.

For a fresh checkout with the project Python environment, run the following from the project root. The installer checks the Maven Central JARs against pinned SHA-256 digests. No downloads occur when users enter names.

```sh
.venv/bin/python -I -m pip install --only-binary=:all: --no-deps jdk4py==25.0.5.1
.venv/bin/python -I install_opsin.py
```

Restart the server. `/api/v1/capabilities` reports `opsinAvailable: true` after a real startup probe. For preinstalled runtimes set `BOND_ATLAS_JAVA` and `BOND_ATLAS_OPSIN_JAR` to the Java executable and runnable CLI JAR respectively. Use `REQUIRE_OPSIN=1 node browser-check/live-dom.mjs 18246` against a local server on that port to test R/S entry end to end.

## What works without OPSIN

Orgchem first checks a local table of exact names and aliases, then tries the offline grammar below. Neither step makes a network request. `Chem.supportedNames` lists the table entries, **not** every name the grammar accepts.

| Family | Supported forms | Try |
| --- | --- | --- |
| Carbon parents | Straight chains from methane through dodecane (1–12 carbons); `cyclo` parents with 3–12 carbons | `cycloheptane` |
| Branches | `methyl`, `ethyl`, straight `propyl` and `butyl`; `methoxy`, `ethoxy`, `fluoro`, `chloro`, `bromo`, `iodo`, `hydroxy`, `amino`. Repeated groups take `di`, `tri` or `tetra` and matching locants | `3-bromo-2-methylpentane`, `2,2,4-trimethylpentane` |
| Unsaturation | One C=C or C#C, or 2–4 explicitly numbered bonds of the **same** multiple-bond type | `hex-2-ene`, `octa-2,5-diyne` |
| Alcohols, ketones, primary amines | `-ol`, `-one`, `-amine` on a saturated chain or ring; 2–4 groups of the same suffix with locants | `3-methylhexan-2-ol`, `pentane-2,4-dione`, `butane-1,2,4-triol` |
| Terminal groups | One `-al`, `-oic acid`, `-amide` or `-nitrile` on a saturated chain; this group's carbon counts as carbon 1 | `2-methylpentanal`, `2-aminopropanoic acid`, `3-methylpentanenitrile` |
| Esters | Straight C1–12 alkyl group, a space, then a saturated (optionally substituted) alkanoate | `ethyl 2-methylbutanoate` |
| Exact library names | Familiar compounds, including some aromatics, heterocycles and names outside the grammar | `acetone`, `isopropyl alcohol`, `ethyl acetate`, `acetic acid`, `glycerol`, `ethylene glycol`, `formaldehyde`, `chloroform`, `toluene`, `pyridine`, `diethyl ether`, `aspirin`, `acetaminophen`, `caffeine` |

Case, surrounding whitespace, repeated spaces between words, and common typographic dash variants are normalized. Other punctuation matters. Write `3-methylhexan-2-ol`, not `3 methyl hexan 2 ol`. Commas separate locants of one group; hyphens separate distinct numbered prefixes. Preferred IUPAC spelling, longest-chain choice, alphabetic order and lowest numbering are **not** certified: the parser constructs the connectivity actually specified. It does not name arbitrary graphs in reverse.

## When the parser stops

- Give explicit positions whenever possible. Chain ketones default to carbon 2 only on propane or unsubstituted butane; alcohols/amines can omit the position on methane or unsubstituted ethane. A single double/triple bond can omit its position on two-carbon or unsubstituted three-carbon parents. A sole ring suffix starts at 1. Terminal groups have a fixed position. A single unnumbered prefix is allowed on an otherwise unsubstituted ethane or cycloalkane; on methane all prefix sites coincide. The exact-name table also accepts individual conventional forms. `hexanol`, `butene` and `methylpentane` are not guesses for a 1- or 2-isomer.
- Out-of-range locants, inconsistent multiplicities, duplicate multiple-bond locants, impossible valence, or substituted terminal functional-group carbons fail. Inputs are limited to 180 characters and 64 non-hydrogen atoms. Formula enumeration limits are separate.
- This grammar represents **connectivity only**. No R/S, E/Z, cis/trans, isotopes, radicals, salts, mixtures, arbitrary heterocycles/aromatics, fused or bridged rings, nested or N-substituents, mixed multiple bonds, or combinations of unsaturation and a principal functional suffix. Some unannotated examples outside the grammar are individually mapped. Unsupported annotations are not stripped. Supply isomeric SMILES or a suitable structure file through the RDKit service when identity requires them.
- Mixture/product terms such as `rubbing alcohol` or `vinegar` do not identify an individual compound. There is no fuzzy, approximate or remote name fallback. If the intended molecule is not covered, enter SMILES or import a structure file.

## Checking the implementation

Run `node test-naming.js` for graph-identity comparisons with independent SMILES, generated non-table names, ambiguity and invalid-name cases, and entry/import mode routing. `node test.js` runs the existing chemistry and structure-builder regressions.
