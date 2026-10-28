# RR Tools 0.4.14 practical test plan

Run these checks yourself in scratch Rems. They are acceptance checks, not claimed live passes. Record RemNote version, OS, Word/browser version and color mode. Automated evidence is in VERIFICATION.md.

## Practice Selected Flashcards

Practice must run in RemNote's own flashcard screen, never inside the popup. The popup only shows counts and two buttons: Start practice and Other practice modes…

- Select two unrelated Rems plus an ordinary note. Run Practice Selected Flashcards from the command menu. Confirm the Rem/card/skipped counts, then click Start practice. The popup must close and RemNote's full flashcard screen must open with the title “RR Tools – Practice Selection”. Only due cards of the selected Rems should appear; no card from any other Rem, and never the global queue.
- The popup must show “X due now · Y new · Z not due yet” matching the Cards table for the same cards (each card counted once). With only future cards selected, it must point to Practice All Flashcards.
- Click Other practice modes… instead. The document “RR Tools – Practice Selection” must open. Use the arrow beside its Practice button: Practice All Flashcards must show every selected card (including cards not yet due); Practice Without Recording Answer Choices must not append a repetition to the cards' history.
- Click Save as practice set…, keep or change the default name, and Save. A document with that name must appear under “RR Tools – Practice Sets” with one reference per selected Rem, in selection order. Its Practice button must practice exactly those cards. Double-clicking Save must create one set only. Save a second set: the same parent must be reused. Open practice set must open the new document. Empty names must be refused.
- Repeat from the Rem context menu and the document's … dropdown. The entry is directly in the dropdown; the plugin API does not expose the built-in Flashcards submenu. Select a parent but not its card-bearing child: the child must not be added. Select that child explicitly to include it.
- Include forward-only, backward-only, two-way, cloze, and disabled cards. Verify directions and native card presentation in the queue.
- With no selection, show guidance without opening anything. With only ordinary notes or disabled cards, show zero cards and disabled buttons, never the global queue.
- Run a second session with a different selection. The same practice document must be reused (no second document) and only the new selection's cards may appear. Changing editor selection after opening setup must not alter the captured set.
- During practice the selected Rems show a reference count of 1. After leaving the flashcard screen, the count must disappear within a few seconds and the practice document's line must read “Selected Rems: none …”. Finish a due-card session and choose RemNote's practice-all option if offered: the cards must still appear (the cleanup waits while a queue reopens). Close RemNote during a session, reopen it: the leftover count must be gone.
- With RR Study Timer enabled, check its top line and ordinary tracking in the flashcard screen. Exit with RemNote's normal queue control.
- If RemNote refuses the direct route, the plugin must open the practice document instead and say so in a toast; it must never open the global queue.
- On read failures, show the failing Rem IDs and actual errors. Starting the remaining cards must require an explicit click. Disable the plugin while opening to check the connection error.

## Header options (user-run)

- Before pasting a table, no header checkboxes should appear. With a table, Header Row and Column Row appear above the preview and start unchecked.
- Check Header Row: only the first row becomes headers. Check Column Row: only the first column becomes headers. With both checked, the union becomes headers, with no duplicated corner cell.
- Uncheck both: all cells revert to data cells. Colors and text must not change. Paste a new table and confirm both reset to unchecked.
- Paste each combination into scratch Rems and verify native RemNote header behavior after reopening the document. The plugin sends HTML th cells and row/col scope; simulated tests do not establish RemNote's final header controls.
- Repeat with a first-column cell spanning two rows: the cell beside that span must not become a first-column header.
- Direct clipboard reading of a table should stop at the preview for header selection; the next Paste inserts it.

## Table acceptance test (user-run)

1. Copy the colored Word table. Place the caret in a scratch Rem and open Paste with colors. Confirm footer 0.4.5 and a table preview with colored endings, correct rows and columns.
2. Click Paste once. Look under that destination for the new Pasted table child. Confirm it is a native editable RemNote table, with every source row/cell and the colored endings. Existing destination text must remain unchanged.
3. Navigate away and return/reload to check that colors persist. Verify cell editing and any merged cells. Use the palette first; test Exact RGB separately.
4. Test empty cells and repeated words with different colors; colors must remain in their respective cells. Test a header row, surrounding text, multiple tables and positive row/column spans.
5. A double-click must create only one container/table. Cancel must create nothing.
6. If an error appears, inspect the new Pasted table before retrying. Copy the error details, especially unconfirmed cell counts or Rem IDs. If partial content or RRCP markers remain, the client did not expose or confirm all cells. This is not a verified success. Existing notes must remain untouched.
7. Test ordinary non-table text again: it should still insert at the caret. The popup layout and fixed footer should not change.

## Colored paste

1. Restart the local server if used, then disable/re-enable RR Tools. Confirm footer 0.4.5. Only one paste command is needed: RR Tools: Paste with colors….
2. Open fixtures/word-spanish-colors.rtf in Word, or use your original sample. Copy all five rows. Place the caret in an empty scratch Rem, open the command, click the paste box and Ctrl+V. Expect the text visibly inside the box: aba blue, é green, é yellow/ochre, ía red, a red; black/default bold stems; a five-row, two-column table.
3. Click Paste once. Expect the popup to close, ordinary text to appear at the original destination (tables go inside a new Pasted table child) and a success message. No Prepare or second command. Verify accents, all five rows, formatting and surrounding text.
4. With an empty box, click Paste. If clipboard reading is allowed, expect direct insertion. If blocked, the actual error should remain visible above the footer. Ctrl+V followed by Paste must remain usable.
5. Paste a long document. The text box must display its content immediately and scroll to the final line. The options area can scroll independently. Paste and Cancel must remain visible without scrolling to the end of the text.
6. Test a caret in the middle of existing text, a selected word, and a flashcard's back field. Only the intended field/range should change. Record the host's selection replacement behavior. Check that Undo restores the prior content.
7. Try double-clicking Paste: expect one insertion. Cancel must leave the note unchanged. Opening with whole Rems selected or no active editor must report that a text caret is needed.
8. Change the destination text/pane while the popup is open if the client allows it. Detected changes must cancel insertion with an explanation. The plugin must never fall back to overwriting a whole Rem.
9. Test plain text, web inline colors, and exact RGB separately. Reload/navigate away and back to verify persistence. Record exact colors as unsupported if the host drops them; use the default palette instead.
10. If an editor write fails, expect the actual returned error and an instruction to inspect the note before retrying. An error may follow a successful but unconfirmed write; there must be no automatic retry.

## Destination connection regression

- Open the popup with a fresh command: Connecting to the destination Rem should resolve, Paste should enable, and the empty box should not show a text/conversion error.
- Paste while the connection is pending: text must stay visible and Paste enable when ready.
- In a simulated host, omit contextData: the index handshake must still supply the captured destination and insertion should work once.
- In a simulated host, leave an old index running with no handshake handler: after four seconds the popup must explain how to restart/re-enable RR Tools. Paste remains disabled, and Ctrl+V must not hide that explanation.
- A popup without any captured destination must never infer a destination from the popup focus or change a Rem.

## Existing tools

- Direction changes: select scratch forward/backward/two-way cards and an ordinary note. Change a matching From direction to a different To direction. Verify changed/skipped/failed counts in the same popup until Close. No Finished button. Unselected and nonmatching Rems must stay unchanged. Verify arrows and persistence.
- Select All: use a scratch document with nested/collapsed Rems. Compare RR Tool Select All with document options → Select All Rem. Descendants should be selected and expanded, the title excluded, and other documents unaffected. Check reported counts and partial-selection errors.
- Startup: no invalid app.registerRemMenuItem endpoint warning. If an optional menu is unavailable, commands should still register.

## Local automated checks

Run npm.cmd run check, npm.cmd test, npm.cmd run build.

scripts/browser-smoke.cjs uses an isolated headless Edge profile, a locally simulated SDK host and synthetic clipboard events. Set RR_TEST_WIDGET=paste or practice-selected and RR_TEST_MODE=sandbox or native. RR_BROWSER selects the browser executable (bundled uses Playwright's own Chromium; default is Edge). Add RR_TABLE_FIXTURE=1 for the Spanish table preview and structured request test. It checks visible colored text in the box, an 800-row scroll, fixed actions and the single Paste request. Omit RR_TEST_WIDGET to test the completed direction popup. Playwright must be available in Node module resolution.

These tests never connect to a real knowledge base or read the system clipboard. Converter tests prove the generated payload, not RemNote's rendering/persistence. The popup-to-index integration test unmounts the popup before insertion to verify that closing it does not terminate the operation.
