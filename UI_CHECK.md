# Reaction bench: usability and clarity

**Verdict:** The quickest first experiment is a worked pair: open **Reagents > Reaction plates**, choose a pair, **Add example plates**, then **Check pathways**. Creating a product is a separate action so you can compare predictions without filling the rack. For an unfamiliar large molecule, start with 2D and focus an atom; a conformer calculation is not needed to find a region. These are findings from task walkthroughs and automated checks, not ratings from a learner study.

| Task | What the learner sees | Remaining friction or limitation |
| --- | --- | --- |
| Start on a new PC | The [Windows walkthrough](README.md#run-locally) starts at installing Python and extracting the ZIP. It shows how to open `cmd` in the correct folder, the success message and how to restart. | First installation needs internet and a compatible Python 3.13 build. The browser tab does not open automatically. The launcher suite runs on Linux; it is not a clean-Windows installation test. |
| Find one reaction site among many atoms | Above 32 parent atoms, the guide's numbered site map starts at the reacting atoms and their two-bond neighbourhood. Dashed ends mean the molecule continues. **Show whole molecule** restores context without numbering every carbon. | The full overview conveys position, not legibility of every bond on a phone. Diagram numbers are local IDs, not naming locants. |
| Jump to another region | **Focus on** in the inspector selects an atom directly rather than requiring repeated zoom and pan. **Fit** returns to the whole molecule. The atom menu works without a pointer. | A learner who does not know the atom number should start with the selected reaction site. A 3D model requires a verified conformer; the 2D view remains usable without one. |
| Compare heating setups | Two worked pairs start with ethanol and aqueous acidified dichromate(VI). Distillation removes ethanal; reflux keeps it in contact with excess oxidant to form ethanoic acid. Plain **Heat** asks for a setup instead of guessing. | These are textbook outcomes, not temperature, yield or apparatus simulations. |
| Read hydrogen deficiency | The formula and DBE appear together, including the number of missing hydrogen atoms relative to the saturated open chain. An inapplicable calculation is distinguished from zero. | One DBE can indicate a ring or a double bond; the formula alone cannot distinguish them. |
| Compare or reuse plates | Every plate has a stable `P` number; a child records both parents. Long structural strings are disclosed instead of filling rack headings. Inspect and Remove carry plate-specific accessible names. | Plates are session-only. A model workspace export does not save the plate rack. |

## Evidence from this build

The backend suite passed 112 tests and all 29 JavaScript suite files passed. The live DOM run exercised all ten Cambridge worked pairs and switched a 71-atom parent between the cropped site and whole-parent view. For propanone reduction, the starting plate displayed 1 DBE (two H atoms short); the product displayed 0. The service generated verified 3D coordinates for a 66-carbon structure. These checks establish which actions work, not whether the graphics are legible on every display.

A separate desktop Chromium check on propanone exercised keyboard atom selection, 2D zoom, WebGL site focus, mode switching and **Fit** without page errors. Zoom increased the rendered drawing width from 884 to 1199 pixels. At the 256-base-atom limit, a separate synthetic-conformer test confirmed that switching between terminal and interior atoms reuses the model and that **Fit** restores the whole structure. The 256-atom test was not a visual inspection on a phone.

## Reproduce the checks

After installing the development dependencies as described in [BROWSER_CHECK.md](BROWSER_CHECK.md), run `.venv/bin/python browser-check/run-live-dom.py` on Linux/macOS. This starts and stops a fresh local server. The checks exercise the worked pairs, unchanged parents, changed conditions, DBE before/after reduction, local/whole site-map switching and the inspector's camera controls. The viewer test uses real RDKit coordinates and a renderer test double; DOM tests do not measure text overlap, native touch target size or screen-reader announcements.

## Manual checks still needed

- On a phone in portrait at large text size, inspect a long chain and a densely branched parent. Check that atom selection and **Fit** stay reachable without sideways page scrolling.
- In a browser with working WebGL, focus a non-terminal atom in 3D. Rotate, zoom out, then fit the model. Confirm the selected neighbourhood is recognisable and the whole model is restored.
- Ask a first-time Windows user to start from the README, make both ethanol oxidation products and explain why they differ. Observe where they stop or ask for help before assigning an ease-of-use score.
