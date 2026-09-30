---
name: ship
description: Verify the last HTML change with Playwright, summarize it, and commit
---
1. Run a Playwright check on the changed page: take a screenshot, confirm no console errors, and check TTS buttons if they were touched.
2. Output a before/after table: section | old | new.
3. git add -A && git commit with a descriptive message (Japanese OK).
4. Report the commit hash and the summary table.
