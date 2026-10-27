<p align="center">
  <img src="./public/logo.png" width="180" alt="RR Tools icon" />
</p>

# RR Tools

**Colored text and table paste, selected-card practice, bulk flashcard direction changes, and document-wide selection for RemNote.**

RR Tools brings everyday editing utilities into RemNote. Import colored text from Word or a website, keep copied tables organized, change the direction of selected flashcards, and select a document's Rems with one command.

Part of the RR plugin family, alongside **RR Study Timer** and **RR Smart TTS**.

## Features

| Tool | What it does |
| --- | --- |
| **Paste with colors** | Converts copied HTML into formatted RemNote text, including foreground colors, bold, italic, underline, inline code, and links. |
| **Table paste** | Preserves the table structure and applies the converted text formatting to its cells. |
| **Table headers** | Lets you choose the first row, first column, or both as headers. |
| **Flashcard directions** | Changes selected matching flashcards from Forward, Backward, or Two-way to another direction. |
| **Practice Selected Flashcards** | Practices the cards of the selected Rems in RemNote's own flashcard screen. |
| **Select All** | Selects the current document's body Rems, including nested descendants. |

Mobile is enabled in the plugin configuration.

## Installation

1. Download `PluginZip.zip` from the [latest release](https://github.com/rorugi/rr-tools/releases/latest), or build it yourself (see **Development**).
2. In RemNote, open **Settings → Plugins and Themes → Build** and upload the ZIP using **Upload Plugin**.
3. Enable **RR Tools** and grant its requested permissions.
4. Open RemNote's command menu and search for **RR Tools** or **RR Tool Select All**.

When updating an existing installation, disable and re-enable RR Tools to refresh its running commands and popups. If you use a local development server, restart that server as well.

## Paste with colors

1. Copy formatted text from Microsoft Word or a website.
2. Place the caret in the destination Rem, or select text within its text field.
3. Run **RR Tools: Paste with colors…**.
4. Paste into the box with **Ctrl+V** on Windows/Linux or **Cmd+V** on macOS. On touch devices, use the system Paste action.
5. Review the formatted content, choose a color mode, and click **Paste**.

The text appears directly inside the paste box. Long content scrolls while the action buttons remain visible. A new paste replaces the box's previous contents.

With an empty box, **Paste** attempts to read the clipboard directly. If the browser blocks that request, use the paste box instead. Clipboard access is separate from permission to read or modify Rems.

### Color modes

- **RemNote palette:** maps source colors to RemNote's named colors. Shades follow your RemNote theme; ochre maps to yellow, and near-black or near-white use the editor's default color.
- **Exact RGB (experimental):** retains source RGB values in the generated text formatting.
- **Plain text only:** removes text formatting. Tables retain their grid.

Source colors require HTML clipboard data. Plain-text or RTF-only clipboard content cannot provide colors to this converter. Inline colors and inherited inline styles are supported; external stylesheets, CSS classes, fonts, images, and background highlights are not imported.

## Paste tables

When copied content contains a table, the popup displays a colored table preview. Click **Paste** to add it inside a new **Pasted table** child under the destination Rem. Existing destination text is kept.

The plugin imports the table structure, applies each cell's converted formatting, and reads the values back to check the result. Repeated words in different cells are matched separately.

Two options appear above the preview:

| Option | Effect |
| --- | --- |
| **Header Row** | Uses the first row as column headers. |
| **Column Row** | Uses the first column as row headers. |

Both options default to **unchecked** and reset with each new paste. Enable either or both. The choices apply to every table in the copied content and update the preview immediately. Source HTML header tags do not override these choices.

If a table is read directly from the clipboard into an empty box, the popup first displays the preview and header options. Choose the headers, then click **Paste** to insert it.

Multiple tables, surrounding text, empty cells, and positive row/column spans are supported in the import payload. Each paste is limited to **500 cells**. Nested tables and oversized merged grids are rejected.

If an import or formatting operation fails, inspect the new **Pasted table** child before retrying. A partial import or temporary `RRCP` cell identifiers may remain. The error includes the affected container or cell details. Existing notes are not deleted, and failed writes are not automatically retried.

## Change flashcard directions

1. Select the Rems containing the flashcards you want to change.
2. Run **RR Tools: Change selected flashcard directions** from the command menu or Rem context menu.
3. Choose **From** and **To**: **Forward**, **Backward**, or **Two-way**.
4. Click **Change selected flashcards**.

Only selected flashcards matching the From direction are changed. Ordinary notes, nonmatching directions, and disabled cards are skipped. Descendants are included only when they are explicitly selected.

The popup keeps the changed, skipped, and failed counts visible until you click **Close**. Individual failures include the Rem ID and error details.

## Practice Selected Flashcards

1. Select the Rems whose flashcards you want to practice.
2. Choose **Practice Selected Flashcards** from the document's **…** dropdown, the command menu, or the Rem context menu.
3. Check the selected Rem and flashcard counts, then choose:
   - **Start practice** opens RemNote's normal flashcard screen with the selected cards that are due (spaced repetition).
   - **Other practice modes…** opens the practice document. Click the arrow beside its **Practice** button to choose **Practice All Flashcards**, **in Order**, or **Without Recording Answer Choices**.
4. Practice as usual and leave with RemNote's normal queue controls.

The document menu entry appears directly in **…**. RemNote's plugin menu API does not provide an insertion point inside its built-in **Flashcards >** submenu.

### How it works

RemNote does not let a plugin start its flashcard screen with an arbitrary list of cards. It does let you practice a document, and a document's queue includes the Rems it references, without their children (see RemNote's article on [which flashcards belong to a document](https://help.remnote.com/en/articles/8892109-how-does-remnote-decide-what-flashcards-are-part-of-a-document)). RR Tools therefore keeps one document called **RR Tools – Practice Selection**. Each run replaces its single **Selected Rems:** line with references to the Rems you selected and opens `/flashcards/<document>`, RemNote's [documented route](https://help.remnote.com/en/articles/11553351-using-quick-navigation-routes) for a document's queue.

- The document is created on first use and reused afterwards; RR Tools never deletes Rems. You can move it anywhere, but don't add other content under it, since that content would be practiced too. If you delete it, the next run creates a new one.
- While you practice, the selected Rems show a reference count from this document. About two seconds after the flashcard screen closes, RR Tools removes the references so the count disappears. If RemNote was closed mid-session, the leftovers are removed the next time the plugin starts. Each run uses the list once: run the command again for another session.
- Only cards belonging to explicitly selected Rems are included; select any child Rems you also want to include. Disabled Rems, inactive directions and Rems without cards are skipped. Two-way cards contribute both enabled directions, and cloze cards keep their native presentation.
- If some Rems cannot be read, their IDs and actual errors appear above **Practice available flashcards**. An empty selection never opens the global queue.
- If RemNote does not accept the direct route, RR Tools opens the practice document instead (its **Practice** button starts the same queue). It never falls back to the global queue.
- Because practice runs in the normal flashcard screen, the **RR Study Timer** top line is available there; enable RR Study Timer separately to display it.

## Select all Rems in a document

Run **RR Tool Select All**, or choose **Select All Rem** from the document options menu.

The command selects the document's body Rems and their descendants, expands collapsed descendants, and excludes the document title. It does not follow references or embedded portals into other documents. The result reports the confirmed selection count or any partial-selection error.

## Permissions and privacy

RR Tools requests **All / ReadCreateModify** access so its commands can work across the knowledge base, and **KnowledgeBaseInfo / Read** to identify the current knowledge base when opening selected-card practice. RemNote treats these as separate permissions. It does not request native access or deletion permission.

When updating from 0.4.8 or earlier, approve the revised permission request. Restarting a development server alone does not update an installed plugin's permissions.

Selected-card practice stores the selection as Rem references in the **RR Tools – Practice Selection** document of your knowledge base, which syncs like any other document, and remembers that document's ID in the plugin's synced storage.

Clipboard content is processed by the plugin and passed to RemNote for insertion. RR Tools does not send it to an external service or add analytics. Inserted content follows RemNote's normal storage and synchronization behavior.

Source HTML is parsed in an inert document and converted into allowed text formats. Scripts, event handlers, and embedded media are not mounted in the preview.

## Development

Use **Node.js 22 or newer**. From the plugin directory:

```sh
npm ci
npm run dev
```

Add `http://localhost:8080` as a development plugin in RemNote. The development server watches both sandbox and native bundles.

To create an installable package:

```sh
npm run check
npm run build
```

The build validates `public/manifest.json` and produces `dist/` and `PluginZip.zip`. Plugin settings, including `enableOnMobile`, are defined in `public/manifest.json`.

## Reporting issues

Include the RR Tools version, RemNote version, operating system, command used, and exact error message. For formatting issues, provide a small non-sensitive example and describe the expected result. For table issues, include the table dimensions, selected header options, and color mode.

## Author

Roland Russwurm
