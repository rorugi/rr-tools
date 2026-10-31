import type { ReactRNPlugin, RNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import type { TablePaste } from './convert-table';
import { insertColoredTable } from './table-insert';
import type { PasteLine } from './lines';
import { describeLines, insertLines } from './lines-insert';
import { VERSION } from './version';

export const PASTE_REQUEST = 'rr-tools/paste/request';
export const PASTE_RESPONSE = 'rr-tools/paste/response';
export const PASTE_CONNECT = 'rr-tools/paste/connect';
export const PASTE_CONNECTED = 'rr-tools/paste/connected';
/** target: caret = the Rem with the caret (Paste with colors); document = the end of a document (Multi-Paste). */
export type PasteTarget = 'caret' | 'document';
export type PasteContext = { jobId: string; supportsTables?: boolean; supportsLines?: boolean; target?: PasteTarget; destinationName?: string; version?: string };
type Message = { type?: string; jobId?: string; connectionId?: string; richText?: RichTextInterface; table?: TablePaste; lines?: PasteLine[]; supportsTables?: boolean; supportsLines?: boolean; target?: PasteTarget; destinationName?: string; version?: string; error?: string };
const messageOf = (event: unknown): Message => {
  if (!event || typeof event !== 'object') return {};
  const value = 'message' in event ? event.message : event;
  return value && typeof value === 'object' ? value as Message : {};
};
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The caret's Rem had no text when the popup opened. */
const isEmpty = (text: RichTextInterface) => text.every(part => typeof part === 'string' ? !part.trim() : part?.i === 'm' && !part.text.trim());

/** The index outlives the popup. Capture its destination before focus moves. */
export function createPasteService(plugin: ReactRNPlugin) {
  type Selection = Awaited<ReturnType<typeof plugin.editor.getSelection>>;
  type Job = { jobId: string; target: PasteTarget; name?: string; connectionId?: string; remId: string; paneId: string | undefined; selection: Selection; before: RichTextInterface; work?: Promise<void> };
  let current: Job | undefined;
  let running = false;
  return {
    async open() {
      if (running) return;
      current = undefined;
      const rem = await plugin.focus.getFocusedRem();
      const selection = await plugin.editor.getSelection();
      const before = await plugin.editor.getFocusedEditorText();
      const paneId = await plugin.window.getFocusedPaneId();
      if (!rem || before === undefined || selection && (selection.type !== 'Text' || selection.remId !== rem._id)) {
        throw new Error('Place the caret in the destination Rem (or select text within it), then open Paste with colors.');
      }
      if ((await plugin.focus.getFocusedRem())?._id !== rem._id || !same(await plugin.editor.getFocusedEditorText(), before)
          || !same(await plugin.editor.getSelection(), selection)) throw new Error('The destination changed. Open Paste with colors again.');
      current = { jobId: crypto.randomUUID(), target: 'caret', remId: rem._id, paneId, selection, before };
      await plugin.widget.openPopup('paste', { jobId: current.jobId } satisfies PasteContext, false);
    },
    /** Multi-Paste from the document menu: new Rems go to the end of the active document. */
    async openDocument() {
      if (running) return;
      current = undefined;
      const paneId = await plugin.window.getFocusedPaneId() || await plugin.window.getLastFocusedPane();
      if (!paneId) throw new Error('Open a document first, then choose Multi-Paste.');
      const documentId = await plugin.window.getOpenPaneRemId(paneId);
      const document = documentId ? await plugin.rem.findOne(documentId) : undefined;
      if (!document) throw new Error('The active pane is not a Rem document. Open a document first, then choose Multi-Paste.');
      const name = (await plugin.richText.toString(document.text ?? [])).trim() || 'Untitled';
      current = { jobId: crypto.randomUUID(), target: 'document', name, remId: document._id, paneId, selection: undefined, before: [] };
      await plugin.widget.openPopup('paste', { jobId: current.jobId } satisfies PasteContext, false);
    },
    async handle(event: unknown) {
      const message = messageOf(event);
      if (message.type === PASTE_CONNECT && typeof message.connectionId === 'string') {
        // The popup must confirm the live index owns a captured destination.
        // Do not depend on contextData being delivered by the popup host.
        let error: string | undefined;
        if (!current) error = 'No destination Rem was captured. Close this popup, place the caret in the destination Rem, then open Paste with colors again.';
        else if (current.work || current.connectionId && current.connectionId !== message.connectionId) error = 'This paste destination belongs to an earlier popup. Close and reopen Paste with colors from the destination Rem.';
        else current.connectionId = message.connectionId;
        await plugin.messaging.broadcast({ type: PASTE_CONNECTED, connectionId: message.connectionId, jobId: error ? undefined : current!.jobId, supportsTables: true, supportsLines: true,
          target: error ? undefined : current!.target, destinationName: error ? undefined : current!.name, version: VERSION, error });
        return;
      }
      if (message.type !== PASTE_REQUEST) return;
      if (!current || current.jobId !== message.jobId) {
        await plugin.messaging.broadcast({ type: PASTE_RESPONSE, jobId: message.jobId, error: 'This paste destination has expired. Close and reopen Paste with colors.' });
        return;
      }
      const job = current;
      // Repeated messages share one operation, including a failed editor write.
      job.work ??= (async () => {
        running = true;
        try {
          const lines = Array.isArray(message.lines) && message.lines.length ? message.lines : undefined;
          if (!message.table && !lines && (!Array.isArray(message.richText) || !message.richText.length)) throw new Error('There is no text to paste.');
          if (message.table) await plugin.app.toast(`Pasting ${message.table.cellCount} table cells…`).catch(() => {});
          await plugin.widget.closePopup(true);
          // New Rems are created through the Rem API, so the editor and caret are not needed.
          if (lines || job.target === 'document') {
            let result: string;
            if (message.table) result = await insertColoredTable(plugin, job.remId, message.table);
            else if (lines) result = describeLines(await insertLines(plugin, job.target === 'document'
              ? { kind: 'end', remId: job.remId } : { kind: 'after', remId: job.remId, reuseEmpty: isEmpty(job.before) }, lines));
            else throw new Error('Multi-Paste needs the text as lines. Reopen Multi-Paste and try again.');
            await plugin.app.toast(result).catch(() => {});
            return;
          }
          // Focus restoration may finish after closePopup resolves. Only reads are retried.
          let restored = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            const rem = await plugin.focus.getFocusedRem();
            const text = await plugin.editor.getFocusedEditorText();
            if (rem?._id === job.remId && text !== undefined) { restored = true; break; }
            if (rem && rem._id !== job.remId) break;
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (!restored || await plugin.window.getFocusedPaneId() !== job.paneId) throw new Error('RemNote did not restore the original editor. Nothing was pasted. Place the caret and try again.');
          if (!same(await plugin.editor.getFocusedEditorText(), job.before)) throw new Error('The destination text changed while the popup was open. Nothing was pasted.');
          if (job.selection?.type === 'Text') await plugin.editor.selectText(job.selection.range);
          if ((await plugin.focus.getFocusedRem())?._id !== job.remId || await plugin.window.getFocusedPaneId() !== job.paneId
              || !same(await plugin.editor.getFocusedEditorText(), job.before)
              || !same(await plugin.editor.getSelection(), job.selection)) throw new Error('The destination or selection changed. Nothing was pasted.');
          let result: string;
          if (message.table) result = await insertColoredTable(plugin, job.remId, message.table);
          else {
            try { await plugin.editor.insertRichText(message.richText!); }
            catch (error) { throw new Error(`RemNote did not confirm the paste: ${errorText(error)}. Check the Rem before retrying; it may already contain the text.`); }
            result = 'Text pasted. Use Undo to reverse it.';
          }
          await plugin.app.toast(result).catch(() => {});
        } catch (error) {
          await plugin.app.toast(`Paste failed: ${errorText(error)}`).catch(() => {});
          throw error;
        } finally { running = false; }
      })();
      let error: string | undefined;
      try { await job.work; } catch (e) { error = errorText(e); }
      await plugin.messaging.broadcast({ type: PASTE_RESPONSE, jobId: job.jobId, error });
    },
    clear() { current = undefined; },
  };
}

/** Read-only handshake, even when an older host omits popup contextData. */
export function connectPaste(plugin: RNPlugin, eventId: string, signal?: AbortSignal): Promise<PasteContext> {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomUUID();
    let settled = false;
    const finish = (context?: PasteContext, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      plugin.event.removeListener(eventId, undefined, listener);
      signal?.removeEventListener('abort', abort);
      if (context) resolve(context); else reject(new Error(error));
    };
    const abort = () => finish(undefined, 'Popup closed.');
    const listener = (event: unknown) => {
      const message = messageOf(event);
      if (message.type !== PASTE_CONNECTED || message.connectionId !== connectionId) return;
      if (message.error) finish(undefined, message.error);
      else if (typeof message.jobId === 'string' && message.jobId) finish({ jobId: message.jobId, supportsTables: message.supportsTables === true, supportsLines: message.supportsLines === true,
        target: message.target === 'document' ? 'document' : 'caret', destinationName: message.destinationName, version: message.version });
      else finish(undefined, 'The running RR Tools command returned no destination. Disable and re-enable RR Tools, then reopen Paste with colors.');
    };
    const timer = setTimeout(() => finish(undefined, 'Paste is unavailable because the popup could not connect to the running RR Tools command. Restart your local server if used, disable and re-enable RR Tools, then reopen Paste with colors. No Rem was changed.'), 4_000);
    plugin.event.addListener(eventId, undefined, listener);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    plugin.messaging.broadcast({ type: PASTE_CONNECT, connectionId }).catch(error => finish(undefined, `Could not connect to the destination: ${errorText(error)}`));
  });
}

export function requestPaste(plugin: RNPlugin, eventId: string, jobId: string, richText: RichTextInterface, table?: TablePaste, lines?: PasteLine[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      plugin.event.removeListener(eventId, undefined, listener);
      if (error) reject(new Error(error)); else resolve();
    };
    const listener = (event: unknown) => {
      const message = messageOf(event);
      if (message.type === PASTE_RESPONSE && message.jobId === jobId) finish(message.error);
    };
    const timer = setTimeout(() => finish('No paste result received. Check the destination before trying again.'), table ? 120_000 : 15_000);
    plugin.event.addListener(eventId, undefined, listener);
    plugin.messaging.broadcast({ type: PASTE_REQUEST, jobId, richText, ...(table ? { table } : {}), ...(lines ? { lines } : {}) }).catch(e => finish(errorText(e)));
  });
}
