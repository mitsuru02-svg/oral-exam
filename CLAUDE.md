## Workflow
- This project is static HTML. After each change, verify with Playwright (screenshot plus a TTS/display check where relevant), then make one commit per logical change with a descriptive message.
- TTS reading rules live in the page script. When changing reading rules, re-test every item that uses the affected words.

## Change reporting
After every edit, give a short before/after summary: which section or item number changed, the old text or value, and the new text or value. Never reply only with 'done' or a commit hash.

## Content rules

### Model answers (模範解答)
When writing model answers for the exam page, base them on the reference text the user provides. Keep its wording, order and terminology. If no reference has been given, ask for one before drafting, and don't invent phrasing.

## UI / Styling

### Styling changes
When asked to make text 'bigger' or 'more visible', make a clearly noticeable change: at least +25–50% font size, or one step up the scale, e.g. 16px→22px. State the exact before/after values. Verify with a Playwright screenshot and describe the visual difference.
