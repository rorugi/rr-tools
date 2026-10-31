# RR Tools

RR Tools brings everyday editing and study utilities into RemNote: paste colored text and tables from Word or websites, practice only the flashcards you selected, change flashcard directions in bulk, and select a whole document with one command.

![RR Tools](https://raw.githubusercontent.com/rorugi/rr-tools/main/public/logo.png)

## What's new

<!-- Keep the latest 10 version updates, newest first, with one concise bullet per version. -->

- **0.4.19:** `##tag` in a pasted line tags the new Rem (existing tags are reused, missing ones created).
- **0.4.18:** Word headings (H1–H3) and Markdown `#`, `##`, `###` lines become RemNote headings when pasting lines.
- **0.4.17:** Pasted lines with `{{…}}` become cloze flashcards, including `{{c1::…}}` groups and hints.
- **0.4.16:** Paste lines as separate Rems, turn >>, << and <> lines into flashcards, remembered paste options, a prefilled paste box, and **Multi-Paste** in the document menu.
- **0.4.15:** **Add to practice set…** appends the selection to an existing practice set.
- **0.4.14:** **Save as practice set…** keeps a selection as a named RemNote document you can practice anytime.
- **0.4.13:** The practice popup shows how many selected cards are due now, new, and not due yet.
- **0.4.12:** Practice references are removed after the session, so no reference count stays on your Rems.
- **0.4.11:** **Practice Selected Flashcards** runs in RemNote's own flashcard screen instead of a popup.
- **0.4.10:** Popup practice for plugins running in restricted mode (replaced in 0.4.11).

## Getting started

Open RemNote's command menu and search for **RR Tools**:

| Command | What it does |
| --- | --- |
| **RR Tools: Paste with colors…** | Pastes copied text or tables with their colors, bold, italic, underline, inline code, and links. |
| **RR Tools: Multi-Paste…** | Pastes copied lines as new Rems or flashcards at the end of the current document. |
| **Practice Selected Flashcards** | Practices only the cards of the selected Rems in RemNote's flashcard screen. |
| **RR Tools: Change selected flashcard directions** | Switches selected flashcards between Forward, Backward, and Two-way. |
| **RR Tool Select All** | Selects all Rems of the current document, including nested ones. |

**Practice Selected Flashcards** and **Change selected flashcard directions** are also in the Rem context menu. **Select All Rem**, **Multi-Paste**, and **Practice Selected Flashcards** are also in the document's **…** menu.

## Paste with colors

1. Copy formatted text from Microsoft Word or a website.
2. Place the caret in the destination Rem, or select text within its text field.
3. Run **RR Tools: Paste with colors…**.
4. The box is filled from the clipboard when RemNote allows it. Otherwise paste into the box with **Ctrl+V** (Windows/Linux) or **Cmd+V** (macOS); on touch devices, use the system Paste action.
5. Check the preview, choose your options, and click **Paste**.

Your choices (colors, line and flashcard options, table headers) are remembered for the next paste.

### Lines and flashcards

- **Split lines into separate Rems:** each line becomes its own Rem, directly below the Rem with the caret. If that Rem is empty, it receives the first line. A single line is still inserted at the caret.
- **Create flashcards from >> << <> {{ }}:** a line such as `perro >> dog` becomes a flashcard with the text before the arrow on the front and the text after it on the back: `>>` forward, `<<` backward, `<>` two-way. Colors and formatting are kept on both sides. The preview marks flashcards with →, ←, or ↔.

Only the first arrow in a line is used. `>>>` (RemNote's multi-line cards) and lines with an empty side stay ordinary text.

The same option turns `{{…}}` into cloze deletions, for example `Die Hauptstadt von {{Österreich}} ist {{Wien}}.`:

- `{{answer}}` creates one card per cloze.
- `{{c1::answer}}` uses Anki-style numbers: clozes with the same number in a line are hidden together on one card.
- `{{c1::answer::hint}}` adds a hint shown while the answer is hidden.

Clozes keep their colors and formatting and are highlighted in the preview. A line with clozes is not split at `>>`, `<<`, or `<>`.

### Headings

With **Split lines into separate Rems** (and always with Multi-Paste):

- Headings copied from Word or a web page (Heading 1–3, `<h1>`–`<h3>`) become RemNote headings H1–H3, with their colors kept.
- Lines starting with Markdown `# `, `## `, or `### ` become H1, H2, or H3; the hashes are removed. A space after the hashes is required, so `#tag` stays text, and `####` is not converted.

Headings can be combined with flashcards and clozes. The preview shows them larger with an **H1**–**H3** label. Without line splitting, the popup points out that headings need it, because one Rem can only have one heading size.

### Tags

With **Split lines into separate Rems** (and always with Multi-Paste), `##tag` anywhere in a line tags the new Rem, as typing `##` does in RemNote: `perro >> dog ##Vokabeln` becomes a flashcard tagged **Vokabeln**.

- The tag is removed from the text; a following comma or period stays.
- An existing top-level Rem with that name is used as the tag; otherwise it is created at the top level. Each missing tag is created only once per paste, and the result message names new tags.
- Tags need `##` directly before the word: `## Title` (with a space) is a heading, `C##` stays text, and a line consisting only of tags stays text.
- Tags work together with headings, flashcards, and clozes, and appear as chips in the preview.

### Multi-Paste

Choose **Multi-Paste** from the document's **…** menu (below **Select All Rem**) or run **RR Tools: Multi-Paste…**. It works like Paste with colors, but the pasted lines are added as new Rems at the end of the current document, so you don't need to place the caret first. Tables are added as a **Pasted table** child of the document.

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

Both options can be combined and are remembered for the next paste. They apply to every table in the copied content and update the preview immediately.

Multiple tables, surrounding text, empty cells, and merged cells are supported, up to **500 cells** per paste. Nested tables are not supported. If a paste fails, check the new **Pasted table** child before retrying; RR Tools never deletes existing notes.

## Practice Selected Flashcards

1. Select the Rems whose flashcards you want to practice.
2. Run **Practice Selected Flashcards**.
3. Check the counts: how many cards are **due now**, **new** (never practiced), and **not due yet**. Then choose:
   - **Start practice** opens RemNote's flashcard screen with the due and new cards (spaced repetition; RemNote's daily limit for new cards applies).
   - **Other practice modes…** opens the practice document. Click the arrow beside its **Practice** button for **Practice All Flashcards**, **in Order**, or **Without Recording Answer Choices**.
4. Practice as usual and leave with RemNote's normal queue controls.

Only cards of explicitly selected Rems are included; select child Rems as well to include their cards. Disabled cards and inactive directions are skipped, and an empty selection never opens your whole flashcard queue. With **RR Study Timer** enabled, its timer row appears as usual.

### The practice document

RemNote lets plugins open the flashcard screen for a document, not for a list of cards. RR Tools therefore keeps one document, **RR Tools – Practice Selection**, and lists the selected Rems in it as references. A document's queue includes the Rems it references, but not their children, so it contains exactly your selection.

- The document is created on first use and reused afterwards. You can move it anywhere, but don't add other content under it, since that would be practiced too. If you delete it, the next run creates a new one.
- While you practice, the selected Rems show a reference count. It disappears a few seconds after you leave the flashcard screen, when RR Tools clears the list. Run the command again for another session.

### Practice sets

To keep a selection, click **Save as practice set…** in the popup, enter a name, and click **Save**. RR Tools creates a normal RemNote document with that name inside **RR Tools – Practice Sets**, with one link to each selected Rem.

- Practice the set anytime with the document's **Practice** button, including Practice All, in Order, and Without Recording. It also appears in Flashcard Home with its due count.
- The linked Rems show a reference count while the set exists. Delete the set document to remove it.
- To extend a set, select more Rems, run **Practice Selected Flashcards**, and click **Add to practice set…** (shown once at least one set exists). Choose the set and click **Add**: Rems that are not in it yet are added at its end. This also lets you build a set from Rems that are not next to each other.
- **Open practice set** in the popup jumps to the saved or extended document.

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
