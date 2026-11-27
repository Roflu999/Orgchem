# Keeping the user guide current

A user-facing feature or workflow change is not complete until the tutorial, wiki, and release notes describe it in the same change.

- In `help-topics.js`, add or revise the relevant task. `tour` is the short walkthrough; `body` is the wiki article. Both are rendered directly in **Tutorial & wiki**. Keep the five-step first visit focused; other features are reachable as individual topic walkthroughs.
- Set `since` to the release that introduced the feature. When an existing feature changes later, preserve its original version and identify the later version alongside the changed instructions, including the walkthrough where relevant. If old version history cannot be verified, say so rather than guessing.
- Check the actual control names, saved-file behavior, and offline limits. Record the change in `RELEASE_NOTES.md`. For a fix with no visible change to the instructions, no new topic is necessary.
- Run `node test-help-guide.js --dom` (install `browser-check` test dependencies first). Try the changed task from both the tutorial and wiki; check that the version is visible and that reading help does not alter a workspace.
