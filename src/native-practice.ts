import type { PluginRem as RemObject, ReactRNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import { selectedIds } from './directions';

/** queue: RemNote's own flashcard screen. modes: the practice document, whose Practice ▾ menu offers every native mode. */
export type PracticeTarget = 'queue' | 'modes';
export type PracticeLanding = 'queue' | 'document';
export const PRACTICE_DOC_KEY = 'practiceSelectionDocument';
export const PRACTICE_LIST_KEY = 'practiceSelectionList';
export const PRACTICE_DOC_TITLE = 'RR Tools – Practice Selection';
export const PRACTICE_LIST_LABEL = 'Selected Rems: ';

type Host = Pick<ReactRNPlugin, 'kb' | 'rem' | 'storage' | 'window'>;

async function stored(plugin: Host, key: string, parent?: string): Promise<RemObject | undefined> {
  const id = await plugin.storage.getSynced<string>(key);
  if (typeof id !== 'string' || !id) return undefined;
  const rem = await plugin.rem.findOne(id);
  return rem && (parent === undefined || rem.parent === parent) ? rem : undefined;
}
async function created(plugin: Host, key: string): Promise<RemObject> {
  const rem = await plugin.rem.createRem();
  if (!rem?._id) throw new Error('RemNote did not create the practice selection document.');
  await plugin.storage.setSynced(key, rem._id);
  return rem;
}

/**
 * RemNote has no public API that starts its full flashcard screen with an arbitrary card list,
 * and restricted plugins cannot reach the host's filtered-queue storage. A document's native queue,
 * however, gathers the exact Rems it references, without their descendants or tagged Rems
 * (help.remnote.com/en/articles/8892109, rule 6). One reusable document therefore holds a single
 * list Rem whose references are replaced by the captured selection on every run. No Rem is deleted.
 */
export async function preparePracticeDocument(plugin: Host, remIds: string[]): Promise<RemObject> {
  const ids = selectedIds(remIds);
  if (!ids.length || ids.length !== remIds.length) throw new Error('No valid, unique selected Rems were captured.');
  let doc = await stored(plugin, PRACTICE_DOC_KEY);
  if (!doc) {
    doc = await created(plugin, PRACTICE_DOC_KEY);
    await doc.setText([PRACTICE_DOC_TITLE]);
    await doc.setIsDocument(true);
  }
  if (ids.includes(doc._id)) throw new Error('The practice selection document itself cannot be practiced as a selected Rem.');
  let list = await stored(plugin, PRACTICE_LIST_KEY, doc._id);
  if (!list) {
    list = await created(plugin, PRACTICE_LIST_KEY);
    await list.setParent(doc._id, 0);
  }
  const text: RichTextInterface = [PRACTICE_LIST_LABEL];
  ids.forEach((id, i) => { if (i) text.push(', '); text.push({ i: 'q', _id: id }); });
  await list.setText(text);
  // Read back: a partially written list would silently practice the wrong set.
  const saved = (await plugin.rem.findOne(list._id))?.text ?? [];
  const refs = saved.flatMap(part => typeof part === 'object' && part && part.i === 'q' ? [part._id] : []);
  if (refs.length !== ids.length || refs.some((id, i) => id !== ids[i])) throw new Error('RemNote did not save the selected Rem references. Practice was not started.');
  return doc;
}

export async function openNativePractice(plugin: Host, kbId: string, remIds: string[], target: PracticeTarget): Promise<PracticeLanding> {
  if (target !== 'queue' && target !== 'modes') throw new Error('Choose a valid practice option.');
  if (!kbId || (await plugin.kb.getCurrentKnowledgeBaseData())._id !== kbId) throw new Error('The knowledge base changed. Select your Rems and reopen Practice Selected Flashcards.');
  const doc = await preparePracticeDocument(plugin, remIds);
  if (target === 'queue') {
    // Documented quick route: remnote.com/flashcards/{doc_id} (help.remnote.com/en/articles/11553351).
    const route = `/flashcards/${encodeURIComponent(doc._id)}`;
    try {
      await plugin.window.setURL(route);
      const actual = new URL(await plugin.window.getURL(), 'https://www.remnote.com').pathname;
      if (actual.endsWith(route)) return 'queue';
    } catch { /* Fall through to the document, which offers the same native queue. */ }
  }
  // Never fall back to /flashcards, which would practice the entire knowledge base.
  await plugin.window.openRem(doc);
  return 'document';
}

/** Remove the references so the selected Rems no longer show a reference count. Returns whether anything changed. */
export async function clearPracticeSelection(plugin: Pick<ReactRNPlugin, 'rem' | 'storage'>): Promise<boolean> {
  const doc = await stored(plugin as Host, PRACTICE_DOC_KEY);
  const list = doc && await stored(plugin as Host, PRACTICE_LIST_KEY, doc._id);
  if (!list || !(list.text ?? []).some(part => typeof part === 'object' && part && part.i === 'q')) return false;
  await list.setText([PRACTICE_LIST_LABEL + 'none (filled by Practice Selected Flashcards)']);
  return true;
}

/**
 * Clears the selection shortly after RemNote's queue closes. A queue that reopens within the delay
 * (for example when switching to "practice all" at the end of a session) cancels the pending clear,
 * and so does starting a new practice run.
 */
export function createPracticeCleanup(plugin: Pick<ReactRNPlugin, 'rem' | 'storage'>, onError: (error: unknown) => void, delayMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  return {
    cancel,
    queueEntered: cancel,
    queueExited() {
      cancel();
      timer = setTimeout(() => { timer = undefined; clearPracticeSelection(plugin).catch(onError); }, delayMs);
    },
    clearNow: () => { cancel(); return clearPracticeSelection(plugin); },
  };
}
