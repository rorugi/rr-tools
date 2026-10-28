# RR Tools — Development

Build and contributor instructions. User documentation is in [README.md](README.md); it is also packaged into the plugin ZIP and shown on RemNote's plugin page, so images there must use absolute URLs (`https://raw.githubusercontent.com/rorugi/rr-tools/main/...`).

## Repository source versus installation ZIP

The repository contains the source in `src/`, the manifest and logos in `public/`, tests, fixtures, and build scripts. Building creates `dist/` and `PluginZip.zip`, which holds the compiled sandbox and native bundles, `manifest.json`, `logo.png`, `index.html`, and `README.md`. Both are ignored by Git; attach the ZIP to a GitHub release instead.

## Build from source

Use **Node.js 22 or newer**.

```sh
git clone https://github.com/rorugi/rr-tools.git
cd rr-tools
npm ci
npm run dev
```

Add `http://localhost:8080` as a development plugin in RemNote. The development server watches both sandbox and native bundles.

To create the installable package:

```sh
npm run check
npm test
npm run build
```

The build validates `public/manifest.json` (including the `KnowledgeBaseInfo / Read` scope required by selected-card practice) and writes `dist/` and `PluginZip.zip`. Upload the ZIP in RemNote under **Settings → Plugins and Themes → Build → Upload Plugin**. When updating an installed copy, approve any new permission request, then disable and re-enable the plugin.

## Releasing

1. Bump the version in `package.json`, `package-lock.json`, `public/manifest.json`, and the version label in the widgets (`src/widgets/*.tsx`).
2. Add a bullet to **What's new** in `README.md` (keep the latest 10).
3. Run `npm run check`, `npm test`, and `npm run build`.
4. Create a GitHub release `vX.Y.Z` and attach `PluginZip.zip`.

## Tests

- `npm test` runs the Vitest suites (converters, services, popups, manifest scopes, practice document handling).
- `scripts/browser-smoke.cjs` renders a built popup with the real SDK in a headless browser against a simulated host. Set `RR_TEST_WIDGET=paste` or `practice-selected` and `RR_TEST_MODE=sandbox` or `native`; `RR_BROWSER` selects the browser executable (`bundled` uses Playwright's Chromium, default is Edge). Add `RR_TABLE_FIXTURE=1` for the table paste fixture.
- `TEST-PLAN.md` lists manual acceptance checks in RemNote; `VERIFICATION.md` records what was verified for each version.
- `scripts/verify-remnote-host.cjs` documents the filtered-queue host contract used before 0.4.11; it is no longer used by the plugin.

## How selected-card practice works

RemNote has no public API that starts the flashcard screen with an arbitrary card list, and plugins run in restricted mode, so the host's filtered-queue storage is out of reach. RR Tools keeps one document, **RR Tools – Practice Selection** (its ID is in synced plugin storage), with one **Selected Rems:** child whose text is replaced by references to the selected Rems. A document's queue gathers the Rems it references without their descendants ([RemNote help](https://help.remnote.com/en/articles/8892109-how-does-remnote-decide-what-flashcards-are-part-of-a-document), rule 6). **Start practice** opens `/flashcards/<document>` ([documented route](https://help.remnote.com/en/articles/11553351-using-quick-navigation-routes)) and falls back to opening the document, never the global queue. Two seconds after `queue.exit` (cancelled by `queue.enter` or a new run), the references are replaced by plain text so no reference count remains.

## Reporting issues

Include the RR Tools version, RemNote version, operating system, the command used, and the exact error message. For formatting issues, provide a small non-sensitive example and the expected result. For table issues, include the table size, header options, and color mode.
