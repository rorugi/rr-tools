import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { errorMessage } from './directions';

/** Select the active document body, never the KB root or every open pane. */
export function makeSelectAll(plugin: ReactRNPlugin) {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      const paneId = await plugin.window.getFocusedPaneId() || await plugin.window.getLastFocusedPane();
      if (!paneId) throw new Error('Open a document and click inside its pane first.');
      const documentId = await plugin.window.getOpenPaneRemId(paneId);
      if (!documentId) throw new Error('The active pane is not a Rem document. Open a document first.');
      const document = await plugin.rem.findOne(documentId);
      if (!document) throw new Error('RemNote could not read the current document.');
      const descendants = await document.getDescendants();
      const ids = [...new Set(descendants.map(rem => rem._id).filter(id => id && id !== documentId))];
      if (!ids.length) { await plugin.app.toast('This document has no Rems to select.'); return; }
      const unchanged = async () => (await plugin.window.getFocusedPaneId()) === paneId
        && (await plugin.window.getOpenPaneRemId(paneId)) === documentId;
      if (!await unchanged()) throw new Error('The active document changed. Run Select All again in the intended document.');
      // Make collapsed descendants visible in this document's display context.
      await document.expand(documentId, true);
      if (!await unchanged()) throw new Error('The active document changed. Run Select All again in the intended document.');
      await plugin.editor.selectRem(ids, documentId);
      const selected = new Set((await plugin.editor.getSelectedRem())?.remIds ?? []);
      const confirmed = ids.filter(id => selected.has(id)).length;
      if (confirmed === ids.length && selected.size === ids.length) {
        await plugin.app.toast(`Selected all ${confirmed} Rems in this document.`);
      } else {
        await plugin.app.toast(`RemNote confirmed ${confirmed} of ${ids.length} requested Rems (${selected.size} selected in total). Check the selection before applying another tool.`);
      }
    } catch (e) {
      await plugin.app.toast(`Select All failed: ${errorMessage(e)}`);
    } finally { busy = false; }
  };
}
