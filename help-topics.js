(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.AtlasHelpTopics = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // These features are present in commit 46951b5, before the first release tag.
  const original = 'Before v3.1.0 (untagged)';

  return { topics: [
    {
      id: 'starter-pairs', title: 'Compare two molecules', since: 'v3.4.0', firstRun: true,
      tour: 'In Model workspace, choose Move an oxygen. Find the oxygen in both drawings: how many carbon atoms touch it in each?',
      body: [
        'Move an oxygen opens ethanol and dimethyl ether. Both have the formula C2H6O. In ethanol the oxygen bonds to one carbon and one hydrogen; in the ether it connects two carbons. Open What changed? to check your reading.',
        'Branch a chain compares two carbon skeletons. Look in a mirror compares two forms of lactic acid with the same connections. Each starter replaces your list; Undo brings it back. To compare your own pair, show both rows and check their boxes. Only the three curated pairs have explanations.'
      ]
    },
    {
      id: 'model-list', title: 'Build a model list', since: 'v3.3.0', firstRun: true,
      tour: 'Choose Add molecule and type propane. Hide that row, then show it again: hiding a molecule keeps its entry.',
      body: [
        'In Model workspace, enter an English name or SMILES in a row. Each visible row gets a model on the canvas. Add up to eight, or duplicate a row to try a different input without losing the first.',
        'Remove affects one row. Check several and choose Remove selected to remove them together; Select all includes hidden rows. Undo and Redo cover the last 32 list changes. Inside a text field, the usual undo shortcut edits the text instead.'
      ]
    },
    {
      id: 'model-geometry', title: 'Compare sizes in 3D', since: 'v3.3.0', firstRun: true,
      tour: 'Switch the model workspace to 3D and choose Fit drawing. Open Measurements on a ready row to find its longest atom-to-atom span.',
      body: [
        'The 2D drawings show connections. In 3D, visible models share one scale; Fit drawing frames the collection. The space between molecules is for display, not a measured separation.',
        'Expand Measurements on a generated row. Select a bond to read its length in angstroms. The overall span includes hydrogen and measures between atom centers, not outer surfaces. Values belong to this calculated shape. If no verified shape is available, use 2D instead.'
      ]
    },
    {
      id: 'edit-model', title: 'Edit a model without losing the original', since: 'v3.3.0', firstRun: true,
      tour: 'Choose Edit atoms on a row and try a change. Use Back without applying to leave the original alone.',
      body: [
        'Choose Edit atoms beside a molecule to open its sketch. Use a bond tool to change connections or Erase to remove one atom or bond. For a batch, choose Select atoms, pick them, then Delete selection. Sketch Undo restores the batch and its bonds.',
        'Apply to molecule replaces the original row. Since v3.4.0, Keep original and compare adds the changed structure beside its source in one undoable step. Back without applying discards the edit. An empty sketch offers to remove the source row instead.'
      ]
    },
    {
      id: 'workspace-files', title: 'Save and reopen your workspace', since: 'v3.4.0', firstRun: true,
      tour: 'Open Workspace files. Choose Save as if available, or Download workspace to keep a local copy of your models and reaction plates.',
      body: [
        'Save as lets you pick a local folder where the browser supports it. Download workspace uses your browser\'s download settings. The .orgchem.json file keeps row inputs, order, visibility, selection and display mode. Apply sketch edits first; the file does not keep unfinished sketches or calculated 3D coordinates.',
        'Since v3.5.0 the file also keeps the reaction rack and product origins. Open workspace replaces both the list and the rack; Undo immediately restores both. A v3.4.0 file opens with an empty rack. Nothing is saved automatically by closing the page.'
      ]
    },
    {
      id: 'formula-search', title: 'Find structures from a formula', since: original,
      tour: 'In Explore isomers, choose C2H6O. Select the alcohol and then the ether; the atom counts stay the same while the bonds change.',
      body: [
        'A formula asks which connections are possible, not which molecule is in a sample. Enter C2H6O in Explore isomers and choose Find isomers. Filter by functional group or sort by relationship, group, name, mass or reactivity priority. Compare with selected structure changes the reference for relationship sorting.',
        'The search runs in your browser for small, connected, neutral carbon compounds with supported valences. Larger or more unsaturated formulas can exceed its limits. Reactivity priority ranks structural flags; it is not a stability or safety rating.'
      ]
    },
    {
      id: 'formula-deduction', title: 'Follow a formula deduction', since: 'v3.1.0',
      tour: 'Choose C4H6, then Follow the deduction. Count how many hydrogens are missing compared with C4H10 before looking at the possible structures.',
      body: [
        'An open four-carbon chain with only single bonds could hold ten hydrogens. C4H6 has four fewer: two units of unsaturation. A triple bond uses both; two double bonds, two rings, or a ring and a double bond can also use them.',
        'Follow the deduction shows skeletons and bond arrangements counted by this search, before filtering. Choose Go to structures to inspect the results; the formula alone cannot tell which arrangement you have.'
      ]
    },
    {
      id: 'names-and-smiles', title: 'Open a known name or SMILES', since: 'v3.1.0',
      tour: 'In Explore isomers, choose Compound name and enter acetone. Change the input type to SMILES and try CC(=O)C to open the same connections.',
      body: [
        'Use Compound name for one known structure, Molecular formula for possible connections, or SMILES for bond-by-bond input. In SMILES, = means a double bond and # a triple bond. SMILES input predates v3.1.0. Include stereo, charge and isotope information when it matters.',
        'Names such as 3-methylhexan-2-ol are read locally when supported. Extended names, including (R)-butan-2-ol, need optional OPSIN on this site\'s server. A name opens one structure, not every isomer. The viewer can derive connectivity-only names for a limited range of simple acyclic molecules; this is not universal IUPAC naming.',
        'Look up a database name is separate: only opt in if you want the selected isomeric SMILES sent to PubChem. A result must match charge, isotope and stereochemistry. You can explore without a database name.'
      ]
    },
    {
      id: 'read-structure', title: 'Identify a group from its bonds', since: 'v3.1.0',
      tour: 'Open N#CCC1CC(O)CC1 as SMILES, then Reading the structure and Inspect the evidence. Find the carbon and nitrogen joined by a triple bond.',
      body: [
        'Below the viewer, Reading the structure explains recognized features even without a name. Match the atom IDs in Inspect the evidence to Text description of this molecule. Structure & calculation details lists bond orders, mass and other properties.',
        'Hydrogen-bond donor and acceptor counts are potential sites, not measured interactions. A missing group label means the pattern was not recognized, not that the group is absent. Offline candidates show simpler ring, bond and O-H or N-H evidence.'
      ]
    },
    {
      id: 'sketch', title: 'Draw atoms and bonds', since: original,
      tour: 'Open 2D simulator and load Ethanol. Use Move to drag the oxygen. Its position changes, but the formula and the bonds do not.',
      body: [
        'Open Drawing tools in the 2D simulator. Choose an element and tap to place or replace it. Choose a single, double or triple bond and tap its two endpoints. You can also stamp a benzene ring, attach an atom or add explicit hydrogen. Check the name, formula and selected atom or bond beside the sketch.',
        'Move rearranges the drawing without changing its connections. Since v3.2.0 the simulator offers Free or Idealized chain ends and Elastic drag, which pulls neighbors along. These are drawing aids, not energy calculations. How to read this view explains the difference on demand.'
      ]
    },
    {
      id: 'toolkit-sketch', title: 'Edit charges, isotopes and imported structures', since: original,
      tour: 'Open More elements in the sketcher when your atom needs an isotope or signed charge. Check the validation message before previewing it.',
      body: [
        'The basic editor works offline for C, H, N, O and halogens. Use toolkit mode for additional elements, isotopes and formal charges; the chemistry service checks the result. Imported toolkit records keep atom identities, and an imported salt stays grouped rather than becoming unrelated drawings.',
        'Moving a mapped atom on the page preserves its configuration. Changing its chemical neighbors can invalidate a stereo assignment or a saved conformer. Read the warning and generate fresh geometry rather than relying on an old shape.'
      ]
    },
    {
      id: 'preview-measure', title: 'Link a sketch and measure a shape', since: 'v3.2.0',
      tour: 'Open a model in 3D and expand Inspect atoms & measure. Pick three bonded atoms in order; the second is the vertex of the reported angle.',
      body: [
        'From the simulator, choose View in 3D; Edit in 2D takes you back to the corresponding sketch. On wider screens, Side by side links a picked sketch atom to its model atom. After an edit, choose Update preview to reconnect them.',
        'Pick atoms in 3D or use the atom list. Two picks give a distance; three give an angle. Pick again to remove an atom or clear the selection to start over. Read the source: an illustrative offline model is not a verified conformer. A hydrogen added just for 3D has no sketch counterpart.'
      ]
    },
    {
      id: 'draft-recovery', title: 'Recover an unfinished sketch', since: 'v3.2.0',
      tour: 'If you want a draft on this device, enable Keep a recovery copy in this browser in the 2D simulator. Leave it off on a shared profile.',
      body: [
        'Switching workspaces keeps the sketch in memory. To recover it after closing the app, opt in to a browser recovery copy. On returning, choose Restore draft or Discard saved copy. Turning recovery off deletes the copy.',
        'Anyone using that browser profile can restore it; clearing site data can erase it. Restoring a toolkit draft checks it on this site\'s chemistry server. For long-term storage use a file, not draft recovery.'
      ]
    },
    {
      id: 'stereo', title: 'Compare stereoisomers', since: original,
      tour: 'In Stereo & conformers, load lactic acid with an unspecified center and choose Generate possible stereoisomers. Compare the two assignments.',
      body: [
        'Start with an example, a SMILES or mol block, or Use selected structure to retain its atom identities. Generate possible stereoisomers keeps specified configurations unless you choose Enumerate all. Compare variants to spot mirror images or other differences in configuration.',
        'R/S describes supported tetrahedral centers; E/Z describes supported double bonds. Symmetry can reduce the count: butane-2,3-diol gives three distinct configurations, not four. Check whether the result is complete, capped or unsupported. Cancel calculations if you no longer need a running job.'
      ]
    },
    {
      id: 'alkene-stereo', title: 'Read cis, trans and unspecified alkenes', since: 'v3.2.0',
      tour: 'Compare the cis- and trans-but-2-ene examples in the skeletal view. Look at the methyl groups, not just the E/Z labels.',
      body: [
        'In Stereo & conformers, compare the assigned examples with the unspecified one. The methyl groups in cis-but-2-ene lie on the same side; in trans-but-2-ene they lie on opposite sides. A crossed double bond means unspecified, not a third configuration.',
        'E/Z compares the higher-priority group at each end. Use the four-different-substituents example to see why cis/trans is not a general substitute for E/Z.'
      ]
    },
    {
      id: 'conformers', title: 'Sample shapes of one stereoisomer', since: original,
      tour: 'Select one stereo variant, set Requested to a small number and choose Generate conformers. Switch between the returned shapes without changing the configuration.',
      body: [
        'Resolve any unspecified stereochemistry first. The service samples and verifies 3D shapes for the selected configuration; the seed controls the sampling run. Read the conformer selector, method, units and warnings together. Imported coordinates can also supply a shape.',
        'Relative energies compare only shapes of the same molecular state calculated by the same method. They are not populations, experimental energies or rankings of different stereoisomers. Together places structures in a shared scene for viewing; the gaps do not model interactions.'
      ]
    },
    {
      id: 'linked-views', title: 'Read the same molecule in different views', since: original,
      tour: 'Switch from the skeletal formula to All atoms, then Formula. Which view tells you where the hydrogens are attached?',
      body: [
        'In the selected-molecule viewer, skeletal lines show bonds and usually leave carbons and their hydrogens implicit. All atoms shows those hydrogens; Condensed groups them with their neighbors where practical. Formula counts atoms without specifying any bonds.',
        'In the 3D model, drag to rotate and scroll or pinch to zoom. Toggle H atoms or Labels for clarity; Reset view recenters the camera. Switch back to a flat representation to read the connectivity without perspective.'
      ]
    },
    {
      id: 'projections', title: 'Look along a bond or read a Fischer cross', since: original,
      tour: 'With a selected conformer, open Explore geometry-linked projections and choose Newman. Reverse the viewing direction to exchange the front and rear atoms.',
      body: [
        'For a linked Newman projection, choose an eligible bond and Show linked projection. Its dihedral comes from the selected conformer. Applying a constrained dihedral produces a new checked shape; ring, terminal, aromatic and conjugated bonds cannot be twisted this way.',
        'In a Fischer projection, horizontal bonds point toward you and vertical bonds away. Select a supported center or chain; inverting a configured center selects a different molecular state. Offline projections are schematic examples, not evidence of an assigned configuration.'
      ]
    },
    {
      id: 'electron-views', title: 'Distinguish electron illustrations from data', since: original,
      tour: 'In the 2D model workspace enter benzene and switch between the two Kekulé views. Notice which bonds change on paper and which atoms stay connected.',
      body: [
        'In the 3D viewer, π clouds illustrate supported multiple bonds and Lone pairs adds symbolic electron pairs where the model supports them. Neither option calculates an electron density.',
        'Since v3.3.0 unsubstituted benzene has dedicated views on the 2D model desk and in the starting frame of Reagents. Switch between the two Kekulé contributors, count the six π electrons, then view the delocalised cloud. The contributors depict one molecule, not two structures rapidly swapping bonds.'
      ]
    },
    {
      id: 'calculated-grid', title: 'Display a supplied electron grid', since: original,
      tour: 'Import the matching 3D geometry before opening Import a calculated electron grid. Select the conformer used to calculate your file.',
      body: [
        'Load one scalar Gaussian CUBE file for density or orbital amplitude. Atom types and coordinates must match the selected geometry within 0.03 angstroms. Opposite signs on an orbital surface represent amplitude, not positive and negative charge.',
        'Grid files stay in the browser. The limit is 16 MB and one million values; split multi-orbital bundles before import. This displays a supplied calculation. It does not calculate a wavefunction from the sketch.'
      ]
    },
    {
      id: 'reaction-guide', title: 'Follow one reaction mechanism', since: 'v3.3.0',
      tour: 'In Reagents, open Browse worked examples and choose one. Use Next step to follow one electron-flow arrow before advancing again.',
      body: [
        'Enter a starting molecule or load a worked example. Select a reagent, run the reaction and step through the pathway. A full curly arrow tracks an electron pair; a single-barbed arrow tracks one electron. Some displays are net transformations, not elementary steps. Play steps is optional.',
        'Since v3.4.0 choose Conditions to compare supported outcomes, then Use organic product as starting molecule to continue. Try bromoethane with hydroxide: compare warm aqueous with hot ethanolic conditions. The model workspace stays unchanged. No match means no rule is available, not that no reaction can occur.'
      ]
    },
    {
      id: 'reading-lists', title: 'Find a lesson or Olympiad problem', since: 'v3.4.0',
      tour: 'In Reagents choose a Reading list, then Browse worked examples. Open Learn this reaction when you want a cue or a common mistake.',
      body: [
        'Choose AQA, Cambridge International, Edexcel UK, IB core, IB HL or Olympiad to filter the 32 lessons. The filter changes the examples you browse, not the reactions you can run. These are selected topics, not complete or endorsed syllabuses.',
        'The Olympiad list includes five original problems. Try a question before opening its hint or solution; use the linked example to inspect the chemistry. Analytical data supplied in a problem are not measurements made by the app.'
      ]
    },
    {
      id: 'reaction-sites', title: 'Compare products from different sites', since: 'v3.4.0',
      tour: 'Choose Eliminate from 2-bromobutane. Switch between but-1-ene and a but-2-ene pathway, then locate the highlighted sites on the starting molecule.',
      body: [
        'Choose a Product or site pathway and open Locate the atoms on the starting molecule. Site on the parent distinguishes equivalent positions even when they lead to the same product. Diagram numbers are atom IDs, not IUPAC locants.',
        'Try the asymmetric diol to oxidise one OH at a time. Some rules show E/Z alternatives or more than one addition orientation. The list shows modelled possibilities, not selectivity, quantities or yields.'
      ]
    },
    {
      id: 'reaction-plates', title: 'Prepare plates and collect a product', since: 'v3.4.0',
      tour: 'Open Reagents, then Reaction plates. Choose a worked pair, Add example plates, Check pathways and Create product plate. Both originals stay on the rack.',
      body: [
        'Start with one of ten Cambridge worked pairs or prepare a substance yourself. Choose its role, medium and any catalyst. A solvent or catalyst can also be on a separate plate and combined with a reagent first.',
        'Select two plates and Conditions, then Check pathways. Choose a supported pathway and Create product plate to keep its isolated product, not the whole mixture. Use the product in another step or reuse the parents for a different branch. The rack holds up to 48 plates.'
      ]
    },
    {
      id: 'plate-inspection', title: 'Inspect an atom on a reaction plate', since: 'v3.4.0',
      tour: 'Inspect a plate, choose a component and focus on one atom in 2D. Fit the whole molecule to see where that atom sits in the structure.',
      body: [
        'Inspect a plate or expand Inspect starting structure in the guide. Focus on a local region without waiting for 3D. Where applicable, the degree of unsaturation counts hydrogen deficiency: a ring or a double bond can each account for one unit.',
        'Show 3D requests a verified conformer; unresolved stereo or missing WebGL can leave only the 2D drawing. The service accepts up to 256 base atoms, including explicit hydrogen vertices. The offline interpreter is limited to 64 heavy atoms. Being viewable does not guarantee a reaction rule.'
      ]
    },
    {
      id: 'product-history', title: 'Compare a product with its starting plate', since: 'v3.5.0',
      tour: 'On a collected product, choose Compare with starting molecule. Find the changed bond in the two drawings before opening What changed? if offered.',
      body: [
        'Compare before and after in 2D without replacing the model list. What changed? explains supported transformations; other pairs are still available to inspect. Each product keeps snapshots of both immediate parents, conditions and its selected pathway.',
        'Removing a parent does not erase that immediate record. Save the workspace if you want to return to the original rack as well.'
      ]
    },
    {
      id: 'trace-route', title: 'Trace the steps that made a product', since: 'v3.6.0',
      tour: 'On a collected product, open Trace route. Use Step details to check the reagent and conditions for a particular step.',
      body: [
        'Trace route follows recorded organic plates in order. To build a two-step example, collect ethanal from ethanol under distillation, then use that same ethanal plate to collect the acid under reflux. Reagent preparation belongs in Step details, not in the sequence of organic products.',
        'If you remove the intermediate, the acid still remembers its immediate parent but cannot trace beyond it. Another plate named ethanal cannot fill the gap. Save before removing a plate to keep the full route.'
      ]
    },
    {
      id: 'compare-routes', title: 'Find the fork between two routes', since: 'v3.6.0',
      tour: 'From the same ethanol plate collect products under distillation and reflux. Open Compare routes on a product to see where the routes parted.',
      body: [
        'Compare routes identifies a shared recorded plate, then shows each branch\'s reagent, medium, catalyst, condition and pathway beside its endpoint drawing. Read what differs at the fork rather than guessing from the endpoint names.',
        'Products made from separately added plates with identical structures do not share a recorded origin. Repeating an identical collection or continuing along one unbranched sequence does not create a fork.'
      ]
    },
    {
      id: 'molecule-files', title: 'Import or export a molecular structure', since: original,
      tour: 'Use Paste / import file to open a molecule. When exporting, choose mapped v3 JSON if you want to keep the molecular state and its conformers together.',
      body: [
        'Import SMILES, MOL/SDF V2000 or V3000, or native molecule JSON. Isomeric SMILES keeps supported configuration but no coordinates. Choose MOL for one structure with coordinates, SDF for selected structures or conformers, or native v3 JSON for mapped records, conformers and provenance.',
        'Copy or preview text exports. XYZ stores coordinates only, CSV lists identifiers and calculation metadata, and PNG is a 2D picture. None of those three restores a molecular record. Use Workspace files instead to reopen a model list and its reaction plates.'
      ]
    },
    {
      id: 'display-language', title: 'Change the language or display', since: original,
      tour: 'Open Display & accessibility to try larger text, higher contrast or reduced motion. Use the language selector without leaving your current molecule.',
      body: [
        'Choose English, Spanish, French, Simplified Chinese, Arabic or German. Interface labels change in place without resetting the drawing or viewer. In Arabic the interface reads right to left; the scientific drawings and identifiers keep their orientation. Some scientific details and reaction lessons remain in English.',
        'Choose system, light or dark appearance and check the keyboard guide in Display & accessibility. Focus the 3D viewer: arrow keys rotate, + and - zoom, Home resets and Tab leaves. Text description of this molecule lists atom IDs and neighbors if a drawing is hard to read.'
      ]
    },
    {
      id: 'help', title: 'Use the wiki and first-time tour', since: 'v3.7.0',
      tour: 'Start with the introductory tour for a short path through the model workspace. Return to a single wiki topic when you need a specific task.',
      body: [
        'Use the tour for a first look or choose a wiki topic by the task you want to do. Each topic includes a short step to try. Version labels describe the feature, not the age of your saved molecule.'
      ]
    },
    {
      id: 'local-setup', title: 'Run the app on your computer', since: original,
      tour: 'From the extracted folder containing run_local.py, start the launcher and open the address it prints. Keep that terminal open while exploring.',
      body: [
        'Install Python 3.13 and extract the full source, including vendor. In that folder run py -3.13 run_local.py on Windows or python3.13 run_local.py on macOS or Linux. First setup needs internet access to install dependencies. Do not open the HTML file directly.',
        'Open the printed address (normally http://127.0.0.1:8000) on the same computer. Save your work, then press Ctrl+C in the terminal to stop. A normal restart reuses the local installation. Java is optional and needed only for extended name input. See LOCAL_SETUP.md for installation problems and NAMING.md for OPSIN.'
      ]
    },
    {
      id: 'service-limits', title: 'Know what works offline', since: original,
      tour: 'If a 3D calculation is unavailable, switch to a 2D drawing. To use the chemistry service without an internet connection, install and run the complete app locally first.',
      body: [
        'A static copy can run the limited formula explorer, basic sketcher and local 2D previews. Checked stereochemistry, conformers and toolkit validation need the RDKit service on the same site. On a hosted installation those structures are processed on that host; running locally keeps the processing on your computer.',
        'Host the page and API together on a persistent server, or proxy the API through the same origin. The loopback launcher is not a public deployment. Jobs have size and time limits and expire; save results you need. Optional PubChem lookup requires consent and an internet connection.'
      ]
    }
  ] };
}));
