import { AppEvents, type ReactRNPlugin, type RNPlugin } from '@remnote/plugin-sdk';
import { errorMessage, selectedIds } from './directions';
import { openNativePractice, PRACTICE_DOC_TITLE, PRACTICE_SETS_TITLE, savePracticeSet, type PracticeTarget } from './native-practice';

export const PRACTICE_WIDGET = 'practice-selected';
export const PRACTICE_CONNECT = 'rr-tools/practice/connect';
export const PRACTICE_CONNECTED = 'rr-tools/practice/connected';
export const PRACTICE_START = 'rr-tools/practice/start';
export const PRACTICE_STARTED = 'rr-tools/practice/started';
export const PRACTICE_SAVE = 'rr-tools/practice/save';
export const PRACTICE_SAVED = 'rr-tools/practice/saved';
/** set: open the practice set saved from this selection. */
export type StartTarget = PracticeTarget | 'set';
/** due: scheduled for now or earlier. fresh: never practiced or reset (RemNote's "new" cards). later: scheduled in the future. */
export type PracticeSchedule = { due: number; fresh: number; later: number };
/** remIds: selected Rems that contribute at least one enabled card; these are what RemNote's queue receives. */
export type PracticeSelection = { selected: number; skipped: number; cardIds: string[]; remIds: string[]; errors: string[]; schedule: PracticeSchedule };
type ScheduledCard = { nextRepetitionTime?: number; repetitionHistory?: { score: number }[] };
const RESET_SCORE = 3; // QueueInteractionScore.RESET

export function scheduleOf(card: ScheduledCard, now: number): keyof PracticeSchedule {
  const history = card.repetitionHistory ?? [];
  if (!history.length || history[history.length - 1].score === RESET_SCORE) return 'fresh';
  return card.nextRepetitionTime === undefined || card.nextRepetitionTime <= now ? 'due' : 'later';
}
export type PracticeContext = PracticeSelection & { jobId: string };

/** Read only the explicitly selected Rems. Never gather a document or subtree queue. */
export async function collectSelectedCards(plugin: Pick<ReactRNPlugin, 'rem'>, ids: string[], now = Date.now()): Promise<PracticeSelection> {
  const remIds = selectedIds(ids);
  const result: PracticeSelection = { selected: remIds.length, skipped: 0, cardIds: [], remIds: [], errors: [], schedule: { due: 0, fresh: 0, later: 0 } };
  const cards = new Map<string, ScheduledCard>();
  for (const id of remIds) {
    try {
      const rem = await plugin.rem.findOne(id);
      if (!rem) throw new Error('RemNote returned no Rem for this ID.');
      if (!await rem.getEnablePractice()) { result.skipped++; continue; }
      const direction = await rem.getPracticeDirection();
      const eligible: [string, ScheduledCard][] = [];
      for (const card of await rem.getCards()) {
        if (!card._id || card.remId !== id) throw new Error('RemNote returned a card without a valid ID or belonging to another Rem.');
        if (card.type === 'forward' && direction !== 'forward' && direction !== 'both') continue;
        if (card.type === 'backward' && direction !== 'backward' && direction !== 'both') continue;
        eligible.push([card._id, card]);
      }
      if (!eligible.length) { result.skipped++; continue; }
      eligible.forEach(([cardId, card]) => cards.set(cardId, card));
      result.remIds.push(id);
    } catch (error) { result.errors.push(`Rem ${id}: ${errorMessage(error)}`); }
  }
  result.cardIds = [...cards.keys()];
  for (const card of cards.values()) result.schedule[scheduleOf(card, now)]++;
  return result;
}

type Message = { type?: string; connectionId?: string; jobId?: string; target?: StartTarget; name?: string; selection?: PracticeContext; error?: string };
function payload(event: unknown): Message {
  if (!event || typeof event !== 'object') return {};
  const value = 'message' in event ? event.message : event;
  return value && typeof value === 'object' ? value as Message : {};
}

/** Rem access and navigation stay in the index; the popup only chooses where practice opens. */
export function createPracticeService(plugin: ReactRNPlugin, cleanup?: { cancel(): void }) {
  let current: { selection: PracticeContext; kbId: string; connectionId?: string; work?: Promise<void>; saving?: Promise<{ _id: string; name: string }>; saved?: { _id: string; name: string } } | undefined;
  const expired = 'This selection has expired. Select your Rems and reopen Practice Selected Flashcards.';
  let opening = false;
  return {
    async open() {
      if (opening) return;
      opening = true;
      try {
        const ids = selectedIds((await plugin.editor.getSelectedRem())?.remIds);
        if (!ids.length) { await plugin.app.toast('Select Rems first, then run “Practice Selected Flashcards”.'); return; }
        const kbId = (await plugin.kb.getCurrentKnowledgeBaseData())._id;
        const selection = { ...await collectSelectedCards(plugin, ids), jobId: crypto.randomUUID() };
        current = { selection, kbId };
        try { await plugin.widget.openPopup(PRACTICE_WIDGET, {}, false); }
        catch (error) { current = undefined; throw error; }
      } finally { opening = false; }
    },
    async handle(event: unknown) {
      const message = payload(event);
      if (message.type === PRACTICE_SAVE) {
        let error: string | undefined;
        let saved: { _id: string; name: string } | undefined;
        const job = current;
        if (!job || job.selection.jobId !== message.jobId || !job.connectionId) error = expired;
        else {
          // One set per selection: a repeated click must not create duplicates.
          job.saving ??= (async () => {
            if ((await plugin.kb.getCurrentKnowledgeBaseData())._id !== job.kbId) throw new Error('The knowledge base changed. Select your Rems and reopen Practice Selected Flashcards.');
            return job.saved = await savePracticeSet(plugin, message.name ?? '', job.selection.remIds);
          })();
          try { saved = await job.saving; } catch (reason) { error = errorMessage(reason); job.saving = undefined; }
        }
        await plugin.messaging.broadcast({ type: PRACTICE_SAVED, jobId: message.jobId, name: saved?.name, error });
        return;
      }
      if (message.type === PRACTICE_START) {
        let error: string | undefined;
        const job = current;
        if (!job || job.selection.jobId !== message.jobId || !job.connectionId) error = expired;
        else if (message.target === 'set' && !job.saved) error = 'Save the practice set first.';
        else {
          job.work ??= (async () => {
            const target = message.target!;
            if (target === 'set') {
              const set = await plugin.rem.findOne(job.saved!._id);
              if (!set) throw new Error(`The practice set “${job.saved!.name}” no longer exists.`);
              await plugin.window.openRem(set);
              await plugin.widget.closePopup(false);
              return;
            }
            cleanup?.cancel(); // A pending clear must not wipe the new selection.
            const landing = await openNativePractice(plugin, job.kbId, job.selection.remIds, target);
            await plugin.widget.closePopup(false);
            if (target === 'queue' && landing === 'document') await plugin.app.toast(`RemNote did not open the flashcard screen directly. “${PRACTICE_DOC_TITLE}” is open instead: click Practice at its top right.`).catch(() => {});
            if (target === 'modes') await plugin.app.toast(`Click the arrow beside Practice at the top right of “${PRACTICE_DOC_TITLE}” to choose a practice mode.`).catch(() => {});
          })();
          try { await job.work; } catch (reason) { error = errorMessage(reason); }
        }
        if (error) await plugin.app.toast(`Practice Selected Flashcards: ${error}`).catch(() => {});
        await plugin.messaging.broadcast({ type: PRACTICE_STARTED, jobId: message.jobId, error });
        return;
      }
      if (message.type !== PRACTICE_CONNECT || typeof message.connectionId !== 'string') return;
      const error = !current || current.connectionId && current.connectionId !== message.connectionId
        ? 'This selection is unavailable. Select the Rems and run “Practice Selected Flashcards” again.' : undefined;
      if (!error) current!.connectionId = message.connectionId;
      await plugin.messaging.broadcast({ type: PRACTICE_CONNECTED, connectionId: message.connectionId,
        selection: error ? undefined : current!.selection, error });
    },
    clear() { current = undefined; },
  };
}

/** Do not depend on contextData: some hosts omit it when opening a widget. */
export function connectPractice(plugin: RNPlugin): { result: Promise<PracticeContext>; cancel: () => void } {
  let cancel = () => {};
  const result = new Promise<PracticeContext>((resolve, reject) => {
    const connectionId = crypto.randomUUID();
    let settled = false;
    const finish = () => {
      settled = true; clearTimeout(timer);
      plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, listener);
    };
    const listener = (event: unknown) => {
      const message = payload(event);
      if (settled || message.type !== PRACTICE_CONNECTED || message.connectionId !== connectionId) return;
      finish();
      if (message.selection) resolve(message.selection);
      else reject(new Error(message.error || 'RemNote returned no selected flashcards.'));
    };
    const timer = setTimeout(() => {
      finish(); reject(new Error('No reply from RR Tools. Disable and re-enable the plugin, then select your Rems and reopen this command.'));
    }, 5000);
    cancel = () => { if (!settled) { finish(); reject(new Error('Practice view closed.')); } };
    plugin.event.addListener(AppEvents.MessageBroadcast, undefined, listener);
    plugin.messaging.broadcast({ type: PRACTICE_CONNECT, connectionId }).catch(error => {
      if (!settled) { finish(); reject(error); }
    });
  });
  return { result, cancel: () => cancel() };
}

export function startPractice(plugin: RNPlugin, jobId: string, target: StartTarget): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { settled = true; clearTimeout(timer); plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, listener); };
    const listener = (event: unknown) => {
      const message = payload(event);
      if (settled || message.type !== PRACTICE_STARTED || message.jobId !== jobId) return;
      finish();
      if (message.error) reject(new Error(message.error)); else resolve();
    };
    const timer = setTimeout(() => { finish(); reject(new Error('RemNote did not confirm that practice opened. Close this popup and check the flashcard screen before starting again.')); }, 15000);
    plugin.event.addListener(AppEvents.MessageBroadcast, undefined, listener);
    plugin.messaging.broadcast({ type: PRACTICE_START, jobId, target }).catch(error => { if (!settled) { finish(); reject(error); } });
  });
}

/** Resolves with the saved set's name. */
export function savePractice(plugin: RNPlugin, jobId: string, name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { settled = true; clearTimeout(timer); plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, listener); };
    const listener = (event: unknown) => {
      const message = payload(event);
      if (settled || message.type !== PRACTICE_SAVED || message.jobId !== jobId) return;
      finish();
      if (message.error) reject(new Error(message.error)); else resolve(message.name ?? name);
    };
    const timer = setTimeout(() => { finish(); reject(new Error(`RemNote did not confirm the save. Check “${PRACTICE_SETS_TITLE}” before saving again.`)); }, 30000);
    plugin.event.addListener(AppEvents.MessageBroadcast, undefined, listener);
    plugin.messaging.broadcast({ type: PRACTICE_SAVE, jobId, name }).catch(error => { if (!settled) { finish(); reject(error); } });
  });
}
