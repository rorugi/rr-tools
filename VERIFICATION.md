# RR Tools 0.4.20 stale-index detection

User report: the 0.4.19 preview showed headings and tags, but the created Rems had neither, while clozes worked. Clozes travel inside the line text; headings and tags are separate fields that only the 0.4.18/0.4.19 index applies, and a failed addTag would have raised the read-back error. This matches a popup from the new ZIP talking to an index still running the previous version, which silently ignores unknown fields. The plugin now has one VERSION constant (checked against package.json and the manifest); the index includes it in the paste and practice handshakes, and both popups refuse to proceed with a different or missing version, telling the user to disable and re-enable RR Tools. Heading sizes are now also verified after writing (getFontSize), and Multi-Paste fills a document's empty last bullet (without children) instead of leaving it above the pasted lines. Tests cover the mismatch in both popups, heading read-back, the empty-last-bullet reuse, and version consistency; browser checks include a stale fake index (Paste disabled with the instruction) in sandbox and native modes. Not verified live: that re-enabling resolves the user's case.

---

# RR Tools 0.4.19 ##tags

When lines are split (or for Multi-Paste), ##name tokens preceded by a line start or whitespace are removed from the line (with one adjacent space; trailing punctuation stays) and added as tags: an existing top-level Rem found by name (findByName) is reused, otherwise one is created at the top level once per paste; addTag is verified with getTagRems. Duplicate tags in a line are ignored case-insensitively; a line of only tags stays text; “## Title” remains a heading. Adjacent runs with identical formatting are now merged (cloze runs excepted). A single tagged line is created as its own Rem. Tests cover extraction rules, combination with headings and flashcards, tag reuse/creation, read-back and the popup; the built popup passes in sandbox and native browser checks. Not verified live: tag creation and display in the user's client.

---

# RR Tools 0.4.18 headings

The converter records the line of text inside <h1>–<h3> (Word's Heading 1–3 on the clipboard) as heading levels; h4–h6 stay normal. When lines are split (or for Multi-Paste), those lines, and lines starting with Markdown “# ”, “## ”, “### ” (hashes removed; #tag and #### unchanged), get setFontSize H1–H3 on their new Rem. Headings combine with flashcards and clozes. A single heading or single cloze line is now always created as its own Rem; before, a single cloze line would have been inserted at the caret with literal braces. Without line splitting the popup notes that headings need it. Tests cover heading line indices, Markdown rules, combination with cards/clozes, setFontSize and the popup; the built popup passes text, table and line browser checks in sandbox and native modes. Not verified live: the exact HTML of the user's Word version and RemNote's heading display.

---

# RR Tools 0.4.17 cloze flashcards

With “Create flashcards” on, {{answer}}, {{cN::answer}} and {{cN::answer::hint}} in a pasted line become RemNote cloze runs: the answer keeps its formatting and gets a cId (equal N within a line share one cId, so they form one card) and, for hints, cloze-hint. Empty clozes are ignored; a line with clozes is not split at arrows. Cloze lines count as flashcards. Tests cover plain, grouped and hinted clozes, answers that resemble the cN prefix, colored answers, precedence over arrows, empty clozes and flashcards off; the built popup shows highlighted clozes and sends the cloze line in sandbox and native browser checks. Not verified live: RemNote's card generation from plugin-written cId runs and its display of cloze-hint in the user's client.

---

# RR Tools 0.4.16 lines, flashcards, remembered options, Multi-Paste

Converted rich text can be split at line breaks into separate Rems (lines trimmed, empty lines dropped, formatting runs split at the break). With flashcards enabled, the first >>, << or <> that is not part of a longer arrow and has text on both sides splits the line: front via setText, back via setBackText, direction via setPracticeDirection (forward/backward/both), formatting preserved on both sides. Lines are created through the Rem API as siblings after the caret Rem (an empty caret Rem is filled with the first line) or, for Multi-Paste, as children at the end of the active document; every Rem is read back and failures report how far the paste got (no delete scope, no rollback). A single plain line still uses the editor insert at the caret. Popup options (color mode, line and flashcard options, table headers) are stored in synced plugin storage and validated field by field on load. The popup tries to prefill from the clipboard (rich, then plain text) and never overwrites text the user pasted. Multi-Paste is registered in the document menu directly after Select All Rem and as a command. Unit tests cover splitting, delimiters and edge cases, Rem creation in all destinations, settings, the service flows and the popup; the built popup passes text, table and line/flashcard browser checks in sandbox and native modes. Not verified live: whether RemNote grants clipboard reading to the popup, and the document-menu order in the user's client.

---

# RR Tools 0.4.15 add to practice set

When the popup opens, the index lists the document children of “RR Tools – Practice Sets” (names via richText.toString); a listing failure only hides the option. Add to practice set… appears when at least one set exists. The chosen set must still be a child of that parent; the selected Rems it does not reference yet are appended at its end as reference children, each read back. The reply reports added and already-present counts. Save and add share one operation per popup, so repeated clicks cannot duplicate entries. Unit tests cover listing, dedupe, append positions, refusal of foreign or missing sets, the service flow and the popup states; the built popup passes in sandbox and native browser checks. Not verified live in the user's client.

---

# RR Tools 0.4.14 practice sets

Save as practice set… creates a permanent RemNote document named by the user (whitespace normalized, 1–200 characters) under a reusable parent “RR Tools – Practice Sets” (ID in synced plugin storage, recreated if deleted). Each selected Rem gets one child containing only a reference to it, in selection order; every reference is read back after writing. One set per popup selection: repeated clicks reuse the same save, a failed save can be retried. The KB is checked before writing. Open practice set opens the saved document. The temporary practice document and its cleanup are unaffected. Unit tests cover document structure, parent reuse, name validation, incomplete-write detection, duplicate-click protection, KB change and the popup flow; the built popup passes the save flow in sandbox and native browser checks. Not verified live: the saved document's native queue in the user's client.

---

# RR Tools 0.4.13 due counts in the practice popup

The popup shows how many of the captured cards are due now, new, and not due yet, from each card's repetitionHistory and nextRepetitionTime (public SDK Card fields). New means no history or a last repetition with the RESET score; due means nextRepetitionTime at or before opening the command; each card is counted once. When nothing is due or new, the popup points to Practice All Flashcards. Unit tests cover the classification, deduplication and both popup states; the built popup renders the counts in sandbox and native browser checks. Not verified live: agreement with RemNote's own due counts (e.g. time-zone day boundaries) in the user's client.

---

# RR Tools 0.4.12 reference cleanup

After practice, the selected Rems kept a reference count of 1 from the practice document. RR Tools now listens to the SDK's queue.enter/queue.exit events: two seconds after a queue closes it replaces the list's references with plain text; a queue that reopens within that delay, or a new practice run, cancels the pending clear. On activation, leftovers are cleared unless RemNote is currently on the queue page. Tests cover the delayed clear, cancellation by re-entry and by a new run, the no-document no-op and listener registration. Not verified live: the exact timing of RemNote's queue events in the user's client.

---

# RR Tools 0.4.11 selected practice in RemNote's flashcard screen

Problem: in 0.4.10, Practice Selected Flashcards ran inside the popup (embedded Queue), because RemNote forces plugins into restricted mode and the full-screen adapter depended on writing the host's localStorage, which a restricted plugin cannot reach.

Change: the popup is now setup only; the embedded Queue and the localStorage/filtered-queue adapter are removed, and the manifest no longer requests native access. Practice uses only public SDK calls and RemNote's documented behavior:
- A document's queue includes the Rems it references, without their descendants or tagged Rems (help.remnote.com/en/articles/8892109, rule 6).
- remnote.com/flashcards/{doc_id} is RemNote's documented route for a document's queue (help.remnote.com/en/articles/11553351).

RR Tools keeps one reusable document “RR Tools – Practice Selection” (ID in synced plugin storage) with one “Selected Rems:” child whose text is replaced by references to the selected Rems that have enabled cards. The text is read back and must contain exactly those references in order before navigating. Start practice calls window.setURL('/flashcards/<doc>') and checks getURL; on refusal or mismatch it opens the document (window.openRem) and says so in a toast, never the global /flashcards. Other practice modes… opens the document so RemNote's own Practice ▾ menu provides Practice All, in Order and Without Recording. No Rem is deleted (no deletion scope).

Local checks: TypeScript check, production build/manifest validation and all Vitest suites pass. New tests cover document creation and reuse, replacement of the previous selection, recreation of a deleted document or moved list Rem, exact reference read-back, refusal of empty/duplicate IDs and the document itself, the exact /flashcards/<doc> route, fallback to the document after a rejected or silent navigation failure, KB change, and the popup's two launch options with no embedded Queue.

Not verified live: RemNote's acceptance of setURL('/flashcards/<id>') from a plugin, and the queue contents gathered from references, depend on the user's installed client. TEST-PLAN.md lists the acceptance checks. scripts/verify-remnote-host.cjs documents the obsolete filtered-queue contract and is no longer used by the plugin.

---

# RR Tools 0.4.10 restricted-mode practice fallback

The new screenshot confirms selection/card collection succeeds but the index reports isNative:false. Inspection of the public host's PluginHost constructor establishes why a manifest change cannot fix this: after assigning userPluginInfo it unconditionally sets isNative=false. The Native developer toggle also unregisters/registers the host, passing through that constructor again. The previous instructions to approve native access or reinstall were unsupported and are removed.

The index now advertises its actual native execution capability with the captured selection. If native execution is absent (including older responses without a capability), the popup offers Practice in popup and mounts the supported Queue with the nonempty captured cardIds. It never calls the host-storage adapter or attempts full-screen navigation in this flow. It explains the answer-recording and timer-slot limitations before the user starts, hides unsupported recording controls, and retains Close. The optional native adapter remains guarded for hosts that actually support native execution; no security boundary is bypassed.

Validation: type check and production build pass. All 24 relevant tests across four files pass, including restricted-mode UI, exact card IDs, empty-selection safety, no native start request, and the existing permission tests. An isolated browser using the real built sandbox SDK confirms the Queue embed receives exactly the two fixture card IDs, no navigation/split-pane request occurs, and Close remains inside the bounded popup and responds to a pointer click. Fake cards only; no access to the user's running RemNote was used.

This is a supported fallback, not fulfillment of the requested full-screen/timer/no-recording combination on a host that prohibits native execution. README descriptions of those limitations replace the incorrect native-permission instructions.

---

# RR Tools 0.4.9 knowledge-base permission correction

The screenshot reports a permission rejection for kb.getCurrentKnowledgeBaseData. The public host namespace registration explicitly requires KnowledgeBaseInfo; All / ReadCreateModify does not satisfy that separate scope. Added KnowledgeBaseInfo / Read to the manifest and documented the revised installed permissions. No scope check is bypassed and no extra metadata is obtained through native access.

Regression coverage uses the real SDK KnowledgeBaseNamespace against a scope-enforcing fake host: the previous All-only scopes are rejected, while the release manifest grants the dedicated permission. The production build also refuses to package a manifest missing that scope. The README explains that updating the installed permission grant is required; a development-server restart alone is insufficient.

---

# RR Tools 0.4.8 full-screen selected practice

Replaced openWidgetInPane and the inArticle embedded Queue with a setup popup followed by RemNote's full filtered-queue route. This removes the window-string construction implicated in the user's screenshot. Practice Selected Flashcards is also registered at DocumentMenu. The public host's menu schema and document-menu renderer only support top-level contributions, so the built-in Flashcards submenu cannot be targeted through this API.

Inspected RemNote's publicly served web 1.28.62 bundles on 2026-10-27 without opening a logged-in app. Host module 317259 defines /filtered_queue/:knowledgeBaseId/all and /filtered_queue/:knowledgeBaseId/all_no_srs. Module 631209 reads queueFilteredCardIds from host localStorage and mounts QueueMain with these cards. The second route supplies noSRS:true. QueueMain module 26107 enables QueueBelowTopBar when not inArticle, matching RR Study Timer's registration. The old embedded Queue explicitly set inArticle:true, disabling that slot.

The adapter requires native access, checks the captured knowledge base, writes and verifies only the selected card IDs, navigates to the chosen route, and checks the returned URL before closing the setup popup. It never falls back to the global queue. Native access is now requested in the manifest. This is a host implementation contract, not a newly invented SDK endpoint; it can change in future clients.

Local validation: TypeScript check, all 124 tests in 16 files, manifest validation and production build pass. The public-source contract script executes the extracted filtered-queue adapter with fake Cards/storage dependencies and confirms exact selected IDs, empty behavior, full QueueMain, noSRS propagation, actual route paths and the timer-slot condition. Automated service/UI tests cover both recording options, errors, duplicate clicks/requests, KB changes, denied native access, storage failures and navigation mismatch. The built-SDK native browser check confirms both recording labels, default selection, pointer clicks, the correlated launch request and no embedded Queue or split pane. These checks use a fake host only; they do not establish live scheduling or timer behavior in the user's installed RemNote.

This supersedes the 0.4.7 statement that answer recording cannot be selected: that restriction applies to the public embedded Queue component, which is no longer used here. No RemNote or Word account data was accessed.

---

# RR Tools 0.4.7 selected-flashcard practice

Added Practice Selected Flashcards to the command menu and Rem context menu. The index captures the explicit Rem selection and reads only those Rems' cards. Disabled Rems and inactive forward/backward directions are excluded, card IDs are deduplicated, and cards belonging to other Rems are rejected. The practice pane connects through a correlated, single-view handshake; it does not depend on widget contextData. Empty or failed selections never mount a Queue. Partial read errors retain the affected Rem IDs and require an explicit start of the available cards.

The native SDK Queue receives a nonempty cardIds list and explicit dimensions. No portal, document, custom scheduler, global setting, or no-recording workaround is created. The public QueueProps API has no answer-recording option. The UI and README state that answers may be recorded and change scheduling; no unsupported toggle is offered.

Validation: TypeScript check, 116 tests in 15 files, production build and manifest validation pass. Thirteen new tests cover selection boundaries, disabled/directional/cloze cards, foreign IDs, errors, context-free handshake, timeout/cancellation, empty-queue safety, start/end controls and recording disclosure. The registration regression also checks the new command and unprefixed context-menu endpoint.

Isolated browser checks in sandbox and native modes run the built SDK Queue component against a fake host. Both confirm that Start mounts one Queue with exactly the two fixture card IDs (no folderId), the embed has a 480px height, and End unmounts it. The native test host was extended with the SDK's nativePluginDivs map. These checks establish the outgoing SDK contract, not the real host's scheduler or recording behavior. No RemNote, Word, clipboard or knowledge-base access was used.

---

# RR Tools 0.4.5 header-option verification

Added table-only Header Row and Column Row checkboxes above the preview. Both start unchecked, override source HTML header tags, reset for each new paste and can be combined. Header Row selects the first row; Column Row selects the actual first grid column, respecting cells occupied by row spans. The preview and native HTML import use the same cell flags and row/col scope. Colors and cell values remain unchanged.

Direct reading of a table into an empty popup now displays its preview/options before insertion, so the header choices are available. Normal text keeps its one-click read-and-insert path.

Validation: TypeScript check, all 103 tests across 13 files, manifest validation and production build passed. Coverage includes all four checkbox combinations, source-header override, merged first-column cells, multiple tables, color retention, exported th/scope markup, checkbox visibility/reset, direct clipboard table preview and the existing paste/direction regressions.

Isolated built-SDK browser checks passed in sandbox and native modes. They verify unchecked defaults, actual checkbox clicks, row-only and combined preview headers, visible Paste button and matching header flags in the outgoing structured request. These use fake host/clipboard data only.

No RemNote or Word access was used. RemNote's final interpretation of HTML header scopes and its native header controls still require the user's client test; local assertions verify the preview and import payload, not that host behavior.

---

# RR Tools 0.4.4 table-paste verification

HTML tables now have a structured cell model and a colored table preview. The normal single Paste action sends this model to the index. The index creates an isolated Pasted table child under the captured destination, imports allowlisted HTML table structure containing unique temporary cell identifiers, then replaces those identifiers with each cell's converted RichTextInterface through supported Rem APIs. This explicit formatting step is required because the user reports that ordinary Word-table paste drops colors.

Each changed text/backText field is refreshed before writing and read back afterward; normalized text/color/basic-format runs must match. Duplicate visible cell text is irrelevant because identifiers are unique. Table recognition is checked via isTable. This check does not prove exact merged-cell geometry. Portal rows and direct tag properties are inspected when the table uses the portal Rem type. Existing unrelated fields without the current operation's identifiers are not written. Partial imports remain in the new child for inspection; no deletion scope or automatic rollback/retry was added.

Local checks:

- TypeScript and production build/manifest validation pass.
- 92 tests pass across 13 files, including 6 structured-converter and 8 table-insertion cases.
- Spanish sample: five rows, two cells per row, all five colored endings and bold stems; same popup-to-index integration, popup unmount, table import, explicit formatting, readback, and duplicate-request protection.
- The simulated importer deliberately removes formatting. Tests demonstrate that explicit SDK writes restore it, rather than assuming HTML imports keep colors.
- Repeated words in different colors, empty cells, inherited colors, header/span payloads, surrounding text, rejection of nested/oversized tables, malicious/hidden content, portal-backed rows, partial imports, missing cells, dropped colors, actual write errors and concurrent edits are covered.
- An older running index without the table capability cannot silently flatten the table: the popup blocks it with restart instructions.
- Built SDK popup tests in isolated Edge pass in sandbox and native modes: table grid and blue endings visible, 10 structured cells sent by one Paste action, fixed visible footer, scrolling independent of the actions.

No Word, RemNote, actual clipboard or knowledge-base access was used. Native import behavior, exposure of simple-table cells through the SDK, exact geometry, persistence, Undo and exact RGB rendering still need the user's live test. A confirmed simulated host result is not a claimed live RemNote result. On an unsupported client a partial new table or temporary RRCP identifiers can remain; the error names the new container and affected cells/counts.

---

# RR Tools 0.4.3 verification

The supplied screenshots show the missing-destination setup message and a populated paste box with Paste disabled. Source inspection confirms that a missing contextData.jobId disabled Paste; Ctrl+V cleared the same error state without providing a destination, hiding the explanation. The screenshot does not establish whether the host omitted context or an older index command opened the new popup.

The popup now performs a read-only, correlated handshake with the activated index, independent of host contextData. Only a command that has captured a destination can answer successfully. A connection is bound to one popup, preventing another popup from adopting its stale destination. A missing index response produces explicit restart/re-enable guidance after four seconds. Setup errors have their own state and cannot be cleared by Ctrl+V. Connection loading is visible; an empty ready box is valid for the direct clipboard action.

New empty-state regression tests also exposed unbounded converter recursion for two empty input strings. An explicit empty result fixes this in palette, exact and plain modes.

Validation on 2026-10-27:

- TypeScript check and all 77 tests in 11 files passed; production build and manifest validation passed.
- Integration: omit host contextData entirely, connect to the actual paste service, paste the Spanish sample, unmount the popup and insert its five colored endings once.
- Popup: pending connection plus incoming text, ready empty box, stale index timeout, setup error retained after Ctrl+V, clipboard permission errors and insertion errors.
- Isolated secure-host Edge fixtures with the real SDK: sandbox and native 800-row paste/scroll/footer checks passed with omitted popup context. An unresponsive index fixture confirms the error remains visible after text is pasted and no insertion request or popup close occurs.
- Existing editor guards, direction results and registration tests remain passing.

No RemNote, Word, live clipboard or knowledge-base access was used. Simulated-host success does not verify live focus restoration or persisted colors. The running index must be refreshed along with the popup: restart the local server if used and disable/re-enable RR Tools. The popup footer alone cannot prove a refreshed index; its new handshake confirms readiness.

---

# RR Tools 0.4.2 verification

The paste-only textarea previously had a constant empty value, with converted text rendered in a separate preview below. Its action only staged a session buffer and required a second command. This release displays sanitized formatted text inside the paste box and replaces staging with Paste.

The index captures the destination before opening the popup. A correlated Paste request closes the popup with restoreFocus=true, checks/restores the destination and selection, and inserts once through editor.insertRichText. It owns the operation so popup destruction cannot terminate insertion. Actual errors are retained; no editor write is retried. Clipboard denial keeps the popup and Ctrl+V fallback available. Empty-box Paste directly reads/inserts when permission permits.

Local validation on 2026-10-27:

- TypeScript check and all 69 tests in 11 files passed; manifest validation and production build passed.
- Spanish reconstructed Word-like fixture: same-box formatted display, wrapped message request, popup unmount, then one insertion with all five colored endings and bold formatting.
- Service tests cover duplicate requests, selected ranges, delayed/missing focus restoration, changed Rem/pane/text/selection, stale destinations, original write errors and reply timeout cleanup.
- Popup tests cover visible colored text, single action, clipboard denial followed by Ctrl+V, permitted direct clipboard read, and error retention.
- Isolated headless Edge with the real built SDK passed in both sandbox and native modes: 800 colored rows visible in the paste box, mouse-wheel scrolling to the last row, fixed Paste/Cancel footer, one correlated request containing all 800 colored segments. The popup remains 480px tall. The fake host acknowledges that request; editor behavior is covered separately by the service/integration tests.
- Startup transport tests retain the corrected menu endpoint and confirm the obsolete prepared-text commands are not registered.

No RemNote, Word, actual clipboard or knowledge-base access was used. Live editor focus restoration, card front/back targeting, selection replacement, Undo, and color rendering/persistence still require the user-run TEST-PLAN.md. Passing simulated-host tests does not establish those client-specific behaviors.

---

# RR Tools 0.4.1 verification

The supplied screenshot identified the invalid endpoint `app.registerRemMenuItem`. Inspection of installed project dependency @remnote/plugin-sdk 0.0.46 confirmed that AppNamespace registration methods call the transport without a namespace prefix. The workaround incorrectly supplied app as the namespace. The fix removes that argument while retaining the required html field and existing callback.

The startup regression test now executes the real SDK AppNamespace and RNPlugin transport against an isolated simulated host. It validates outgoing endpoint names and arguments, callback registration, all paste commands and the Select All document-menu entry. A second test checks that an optional menu rejection does not prevent paste registration. The previous test mocked the transport and therefore missed the bad prefix.

Validation: TypeScript check and all 61 tests passed. Production build and manifest validation passed.

Additional 0.4.1 checks: an 800-row colored paste was tested with the built SDK in isolated sandbox and native browser fixtures at a 600px viewport height. The dialog stayed 480px tall, mouse-wheel scrolling worked, and Prepare and close / Cancel remained inside the visible popup. Prepare completed through the simulated SDK host. The body uses a bounded height independent of the iframe viewport to avoid the previous auto-height sizing loop. Clipboard-denial tests verify that the original browser error is retained and no automatic retry is made.

No RemNote or Word application access was made for this fix. Live installation is not claimed as verified. Earlier version evidence follows.

---

# RR Tools 0.4.0 verification

## Current local checks

- TypeScript check, production manifest validation and build passed.
- 60 tests across 11 files passed.
- Spanish sample integration: paste event with reconstructed Word-like HTML → preview → staged rich text → one simulated editor insertion, preserving the five colored endings and bold formatting. This is not a live Word clipboard test.
- Palette tests map medium blue to Blue, green to Green, ochre to Yellow and both red endings to Red; exact-mode tests retain the fixture's hex values.
- Word-style table-cell paragraphs flatten into five rows with tab-separated columns.
- Direction tests retain counts/errors and remove the completed action button; only Close remains.
- Isolated Edge tests with the actual built SDK bundles passed in sandbox and native mode. They include the host-style pseudo-element regression and verify that the completed popup has only one button, Close. These fixtures use fake data and do not access the installed RemNote app.
- Select All tests cover nested/duplicate IDs, exclusion of the document title, empty/non-document panes, navigation races, partial selection, API failure, duplicate invocation, and DocumentMenu registration.

## Live-test boundary

Word access was denied by the computer-use tool. The user then asked to perform the Word paste personally and subsequently revoked all further RemNote access. No application access was attempted after that instruction. Live Word clipboard behavior, exact RGB rendering/persistence and the new Select All menu have not been verified in this version. The historical 0.3.6 results below apply only to that earlier two-card direction test.

---

# RR Tools 0.3.6 verification

## Live diagnosis and repair (2026-10-27)

Tested in the running Windows RemNote desktop app, using only two new cards in `RR Tools temporary test 2026-10-27`.

The popup loaded in a sandbox iframe. A DOM-removal breakpoint showed a real `widget.closePopup` request from the directions-dialog widget. Temporary button logging then showed Cancel handling clicks over the visible Apply button. Computed styles revealed the host's absolute `button::before` layer extended beyond the unpositioned Cancel button. This was a pointer hit-testing bug, not evidence of insufficient Rem permissions or a result-message timeout.

The scoped button style now sets `position: relative`, and decorative `::before`/`::after` layers have `pointer-events: none`. The popup's size and layout are unchanged. Diagnostic logging was removed.

The host also rejected the SDK 0.0.46 `registerRemMenuItem` call because it requires `html`; the SDK wrapper only transmits `name`. A narrow compatibility call sends the required label and reuses the command's registered callback. Failure of this optional registration reports its real error and allows the other commands to finish loading.

## Observed live results

- Both selected forward test cards changed to two-way.
- The popup displayed **2 changed · 0 skipped · 0 failed** and remained open for several minutes until Close was clicked.
- After Close, both test cards visibly showed the two-way arrow.
- Repeating Forward to Two-way on those cards in the 0.3.6 popup displayed **0 changed · 2 skipped · 0 failed**, with a no-match explanation. The popup stayed open.
- No existing user Rems were modified. The named temporary document remains for inspection.

## Automated verification

- TypeScript check passed.
- 52 tests across 9 files passed, including success/failure result retention and startup registration.
- Isolated Edge browser tests passed for sandbox and native widget bundles, using an absolute host-style button pseudo-element and a real pointer click. The test asserts the report remains until Close.
- Production manifest validation and build passed.

The earlier native fixed-height reproduction remains a separate fixture; it did not explain the live sandbox click failure. Clipboard/Word paste and all combinations of direction changes are not newly certified by this test.
