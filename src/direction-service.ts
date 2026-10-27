import type { ReactRNPlugin, RNPlugin } from '@remnote/plugin-sdk';
import { changeDirections, DIRECTIONS, DIRECTIONS_WIDGET, errorMessage, selectedIds, type Direction, type DirectionResult } from './directions';

export const REQUEST = 'rr-tools/directions/request';
export const RESPONSE = 'rr-tools/directions/response';
export const LAST_RUN = 'rr-tools/directions/last-run';
export type DirectionRun = { jobId: string; status: 'running' | 'completed' | 'error'; from: Direction; to: Direction; startedAt: string; result?: DirectionResult; error?: string };
export type DirectionContext = { remIds: string[]; jobId: string; readable: number; accessErrors: string[] };

type DirectionMessage = { type?: string; jobId?: string; from?: Direction; to?: Direction; result?: DirectionResult; error?: string };

/** MessageBroadcast delivers { message: payload }, not payload directly (SDK 0.0.46). */
function broadcastPayload(event: unknown): DirectionMessage {
  if (!event || typeof event !== 'object') return {};
  const payload = 'message' in event ? event.message : event;
  return payload && typeof payload === 'object' ? payload as DirectionMessage : {};
}

/** Keep all Rem access in the activated index widget, not the popup iframe. */
export function createDirectionService(plugin: ReactRNPlugin) {
  let current: { context: DirectionContext; work?: Promise<DirectionResult> } | undefined;
  return {
    async open() {
      const ids = selectedIds((await plugin.editor.getSelectedRem())?.remIds);
      if (!ids.length) { await plugin.app.toast('Select Rems first, then run “RR Tools: Change selected flashcard directions”.'); return; }
      const context: DirectionContext = { remIds: ids, jobId: crypto.randomUUID(), readable: 0, accessErrors: [] };
      for (const id of ids) {
        try {
          if (await plugin.rem.findOne(id)) context.readable++;
          else context.accessErrors.push(`${id}: RemNote returned no Rem before the popup opened.`);
        } catch (e) { context.accessErrors.push(`${id}: ${errorMessage(e)}`); }
      }
      current = { context };
      await plugin.widget.openPopup(DIRECTIONS_WIDGET, context, false);
    },
    async handle(event: unknown) {
      const message = broadcastPayload(event);
      if (message?.type !== REQUEST) return;
      let rejection: string | undefined;
      if (!current || message.jobId !== current.context.jobId) rejection = 'This selection has expired. Select the Rems and reopen the direction command. No changes were started.';
      else if (!DIRECTIONS.some((d) => d.value === message.from) || !DIRECTIONS.some((d) => d.value === message.to) || message.from === message.to) rejection = 'Choose different, valid From and To directions. No changes were started.';
      if (rejection) {
        await plugin.app.toast(rejection);
        await plugin.messaging.broadcast({ type: RESPONSE, jobId: message.jobId, error: rejection });
        return;
      }
      const job = current!;
      // Save and notify in the index widget so a disappearing popup cannot hide the outcome.
      job.work ??= (async () => {
        const run: DirectionRun = { jobId: job.context.jobId, status: 'running', from: message.from!, to: message.to!, startedAt: new Date().toISOString() };
        await plugin.storage.setLocal(LAST_RUN, run);
        await plugin.app.toast(`Changing directions for ${job.context.remIds.length} selected Rem(s)…`).catch(() => {});
        let result: DirectionResult;
        try { result = await changeDirections(plugin, job.context.remIds, run.from, run.to); }
        catch (e) {
          const error = errorMessage(e);
          await plugin.storage.setLocal(LAST_RUN, { ...run, status: 'error', error });
          await plugin.app.toast(`Direction change failed: ${error}`).catch(() => {});
          throw e;
        }
        let saveError = '';
        try { await plugin.storage.setLocal(LAST_RUN, { ...run, status: 'completed', result }); }
        catch (e) { saveError = ` Could not save the report: ${errorMessage(e)}`; }
        await plugin.app.toast(`RR Tools: ${result.changed} changed · ${result.skipped} skipped · ${result.failed} failed.${saveError}`).catch(() => {});
        return result;
      })();
      let response: { result?: DirectionResult; error?: string };
      try { response = { result: await job.work }; }
      catch (e) { response = { error: errorMessage(e) }; await plugin.app.toast(`Direction change could not finish: ${response.error}`).catch(() => {}); }
      // A reply delivery failure must not overwrite a successfully saved result.
      await plugin.messaging.broadcast({ type: RESPONSE, jobId: job.context.jobId, ...response });
    },
    clear() { current = undefined; },
  };
}

export function requestDirectionChange(plugin: RNPlugin, eventId: string, jobId: string, from: Direction, to: Direction): Promise<DirectionResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let polling = false;
    const finish = () => { settled = true; clearTimeout(timer); clearInterval(poll); plugin.event.removeListener(eventId, undefined, listener); };
    const listener = (event: unknown) => {
      const message = broadcastPayload(event);
      if (settled || message?.type !== RESPONSE || message.jobId !== jobId) return;
      finish();
      if (message.result) resolve(message.result); else reject(new Error(message.error || 'No result returned by the main plugin.'));
    };
    const timer = setTimeout(() => {
      finish(); reject(new Error('No completion reply within 60 seconds. The update may still be running. Inspect the cards before starting another batch.'));
    }, 60_000);
    // A missed broadcast must not leave the popup without its completion report.
    const poll = setInterval(async () => {
      if (settled || polling) return;
      polling = true;
      try {
        const run = await plugin.storage.getLocal<DirectionRun>(LAST_RUN);
        if (run?.jobId === jobId && run.status !== 'running') {
          listener({ type: RESPONSE, jobId, result: run.result, error: run.error });
        }
      } catch { /* The reply listener remains active if storage is unavailable. */ }
      finally { polling = false; }
    }, 500);
    plugin.event.addListener(eventId, undefined, listener);
    plugin.messaging.broadcast({ type: REQUEST, jobId, from, to }).catch((e) => { finish(); reject(e); });
  });
}
