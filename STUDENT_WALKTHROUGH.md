# Student walkthrough: predict, manipulate, explain

Use this short lab with a first-time organic chemistry student. It doubles as a release check. Start with a fresh sketch; no account, saved draft, or analytics is needed. Allow about ten minutes. Do not reveal the notebook answers before the prediction.

| Task | What to look for | Follow-up that tests understanding |
| --- | --- | --- |
| Open 2D simulator, identify ethanol, and move its oxygen. | The learner can see the molecule and its formula on a phone, find Move, and return to the sketch. | Did dragging change the formula? What edit actually changes the connections? |
| Compare a sketch with a 3D conformer. In Stereo & conformers select a specified structure and generate one conformer. Pick three bonded atoms in order. | The learner identifies the middle atom as the vertex and locates the source of the measurement. | Would redrawing a wider angle on paper establish a wider physical bond angle? Why not? |
| Load cis-but-2-ene and trans-but-2-ene separately. View their skeletal formulas. Then load the unspecified example. | The learner points to the two methyl groups, not just the E/Z label. Explain that the crossed bond means unspecified, not a third configuration. | Give an example where E/Z is useful but cis/trans would be ambiguous. The four-substituent example is available for comparison. |

## Keep improving it

1. Before a student-facing release, run `browser_ui.py` against the local app on a sandbox-capable browser host. Its `student_walkthrough` check covers phone canvas visibility, keyboard access to the tool drawer, molecule identity, and preserving a drawing and an open explanation during a language change. Use `--capture` for visual references. Check both the light and dark model stages; DOM assertions alone do not test rendered diagrams.
2. Try the three tasks with a small group of students, including keyboard and phone users. Record the task, the first point of confusion, whether a hint was needed, and the learner's explanation in anonymous notes. Do not collect drawings or identities by default.
3. Fix the most frequent obstacle to an explanation, not merely the most frequently clicked control. Repeat with a different molecule and a new learner. If a difficulty recurs, add a regression or an example that exposes it. Keep an exercise only if students can apply the idea to a new case.

This is an evaluation protocol, not evidence that student learning outcomes have already improved.
