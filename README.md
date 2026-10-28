# RR Tools

RR Tools brings everyday editing and study utilities into RemNote: paste colored text and tables from Word or websites, practice only the flashcards you selected, change flashcard directions in bulk, and select a whole document with one command.

![RR Tools](https://raw.githubusercontent.com/rorugi/rr-tools/main/public/logo.png)

## What's new

<!-- Keep the latest 10 version updates, newest first, with one concise bullet per version. -->

- **0.4.12:** Practice references are removed after the session, so no reference count stays on your Rems.
- **0.4.11:** **Practice Selected Flashcards** runs in RemNote's own flashcard screen instead of a popup.
- **0.4.10:** Popup practice for plugins running in restricted mode (replaced in 0.4.11).
- **0.4.9:** Added the knowledge-base permission needed for selected-card practice.
- **0.4.8:** **Practice Selected Flashcards** in the document's **…** menu.
- **0.4.7:** New **Practice Selected Flashcards** command.
- **0.4.5:** **Header Row** and **Column Row** options for pasted tables.
- **0.4.4:** Colored table paste with a preview.
- **0.4.3:** More reliable connection between the paste box and the destination Rem.
- **0.4.2:** Formatted text appears directly in the paste box; one click on **Paste** inserts it.

## Getting started

Open RemNote's command menu and search for **RR Tools**:

| Command | What it does |
| --- | --- |
| **RR Tools: Paste with colors…** | Pastes copied text or tables with their colors, bold, italic, underline, inline code, and links. |
| **Practice Selected Flashcards** | Practices only the cards of the selected Rems in RemNote's flashcard screen. |
| **RR Tools: Change selected flashcard directions** | Switches selected flashcards between Forward, Backward, and Two-way. |
| **RR Tool Select All** | Selects all Rems of the current document, including nested ones. |

**Practice Selected Flashcards** and **Change selected flashcard directions** are also in the Rem context menu. **Practice Selected Flashcards** and **Select All Rem** are also in the document's **…** menu.

## Paste with colors

1. Copy formatted text from Microsoft Word or a website.
2. Place the caret in the destination Rem, or select text within its text field.
3. Run **RR Tools: Paste with colors…**.
4. Paste into the box with **Ctrl+V** (Windows/Linux) or **Cmd+V** (macOS). On touch devices, use the system Paste action.
5. Check the preview, choose a color mode, and click **Paste**.

With an empty box, **Paste** tries to read the clipboard directly. If your browser blocks this, paste into the box instead.

### Color modes

- **RemNote palette:** maps source colors to RemNote's named colors, so shades follow your RemNote theme. Ochre becomes yellow; near-black and near-white use the default text color.
- **Exact RGB (experimental):** keeps the source RGB values.
- **Plain text only:** removes text formatting. Tables keep their grid.

Colors require HTML clipboard content, as copied from Word or a browser. Inline colors are supported; CSS classes, fonts, images, and background highlights are not imported.

## Paste tables

When the copied content contains a table, the paste box shows a colored preview. **Paste** adds it inside a new **Pasted table** child of the destination Rem; existing text is kept.

| Option | Effect |
| --- | --- |
| **Header Row** | Uses the first row as column headers. |
| **Column Row** | Uses the first column as row headers. |

Both options start unchecked for each paste and can be combined. They apply to every table in the copied content and update the preview immediately.

Multiple tables, surrounding text, empty cells, and merged cells are supported, up to **500 cells** per paste. Nested tables are not supported. If a paste fails, check the new **Pasted table** child before retrying; RR Tools never deletes existing notes.

## Practice Selected Flashcards

1. Select the Rems whose flashcards you want to practice.
2. Run **Practice Selected Flashcards**.
3. Check the Rem and flashcard counts, then choose:
   - **Start practice** opens RemNote's flashcard screen with the selected cards that are due (spaced repetition).
   - **Other practice modes…** opens the practice document. Click the arrow beside its **Practice** button for **Practice All Flashcards**, **in Order**, or **Without Recording Answer Choices**.
4. Practice as usual and leave with RemNote's normal queue controls.

Only cards of explicitly selected Rems are included; select child Rems as well to include their cards. Disabled cards and inactive directions are skipped, and an empty selection never opens your whole flashcard queue. With **RR Study Timer** enabled, its timer row appears as usual.

### The practice document

RemNote lets plugins open the flashcard screen for a document, not for a list of cards. RR Tools therefore keeps one document, **RR Tools – Practice Selection**, and lists the selected Rems in it as references. A document's queue includes the Rems it references, but not their children, so it contains exactly your selection.

- The document is created on first use and reused afterwards. You can move it anywhere, but don't add other content under it, since that would be practiced too. If you delete it, the next run creates a new one.
- While you practice, the selected Rems show a reference count. It disappears a few seconds after you leave the flashcard screen, when RR Tools clears the list. Run the command again for another session.

## Change flashcard directions

1. Select the Rems containing the flashcards you want to change.
2. Run **RR Tools: Change selected flashcard directions**.
3. Choose **From** and **To**: **Forward**, **Backward**, or **Two-way**.
4. Click **Change selected flashcards**.

Only selected flashcards matching **From** are changed. Ordinary notes, other directions, and disabled cards are skipped, and child Rems are changed only when they are selected too. The result shows changed, skipped, and failed counts until you click **Close**.

## Select all Rems in a document

Run **RR Tool Select All**, or choose **Select All Rem** from the document's **…** menu.

All Rems in the document body are selected, including collapsed descendants, which are expanded. The document title, references, and portals to other documents are not included.

## Privacy and permissions

RR Tools needs access to your knowledge base to read, create, and change Rems, and to identify the current knowledge base for selected-card practice. It never deletes Rems.

Clipboard content is processed inside the plugin and inserted through RemNote. Nothing is sent to an external service, and there is no analytics. Scripts and embedded media in copied content are never run.

Selected-card practice stores the selection as references in the **RR Tools – Practice Selection** document, which syncs like any other document.

## About

Created by Roland Russwurm. Part of the RR plugin family, alongside **RR Study Timer** and **RR Smart TTS**.
