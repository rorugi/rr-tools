import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { clearPracticeSelection, createPracticeCleanup, openNativePractice, preparePracticeDocument, PRACTICE_DOC_KEY, PRACTICE_DOC_TITLE, PRACTICE_LIST_KEY, PRACTICE_SETS_KEY, PRACTICE_SETS_TITLE, savePracticeSet } from './native-practice';

type FakeRem = { _id: string; parent: string | null; text: unknown[]; isDocument?: boolean;
  setText: ReturnType<typeof vi.fn>; setIsDocument: ReturnType<typeof vi.fn>; setParent: ReturnType<typeof vi.fn> };
function setup() {
  let url = '/w/notes', next = 0;
  const rems = new Map<string, FakeRem>();
  const synced = new Map<string, unknown>();
  const make = (id: string): FakeRem => {
    const rem: FakeRem = { _id: id, parent: null, text: [],
      setText: vi.fn(async (text: unknown[]) => { rem.text = text; }),
      setIsDocument: vi.fn(async (value: boolean) => { rem.isDocument = value; }),
      setParent: vi.fn(async (parent: string) => { rem.parent = parent; }) };
    rems.set(id, rem); return rem;
  };
  const plugin = {
    kb: { getCurrentKnowledgeBaseData: vi.fn(async () => ({ _id: 'kb-test', name: 'Test' })) },
    rem: { createRem: vi.fn(async () => make(`new-${++next}`)), findOne: vi.fn(async (id: string) => rems.get(id)) },
    storage: { getSynced: vi.fn(async (key: string) => synced.get(key)), setSynced: vi.fn(async (key: string, value: unknown) => { synced.set(key, value); }) },
    window: { setURL: vi.fn(async (value: string) => { url = value; }), getURL: vi.fn(async () => `https://www.remnote.com${url}`), openRem: vi.fn(async () => {}) },
  };
  return { plugin, typed: plugin as unknown as ReactRNPlugin, rems, synced, make };
}
const refs = (text: unknown[]) => text.filter((p): p is { i: string; _id: string } => typeof p === 'object').map(p => p._id);

it('creates one practice document whose single list Rem references exactly the selected Rems', async () => {
  const { typed, rems, synced } = setup();
  const doc = await preparePracticeDocument(typed, ['a', 'b']);
  const list = rems.get(synced.get(PRACTICE_LIST_KEY) as string)!;
  expect(synced.get(PRACTICE_DOC_KEY)).toBe(doc._id);
  expect(rems.get(doc._id)).toMatchObject({ text: [PRACTICE_DOC_TITLE], isDocument: true });
  expect(list.parent).toBe(doc._id);
  expect(list.text).toEqual(['Selected Rems: ', { i: 'q', _id: 'a' }, ', ', { i: 'q', _id: 'b' }]);
});
it('reuses the stored document and replaces the previous selection without creating or deleting Rems', async () => {
  const { typed, plugin, rems, synced } = setup();
  const first = await preparePracticeDocument(typed, ['a', 'b']);
  const second = await preparePracticeDocument(typed, ['c']);
  expect(second._id).toBe(first._id);
  expect(plugin.rem.createRem).toHaveBeenCalledTimes(2);
  expect(refs(rems.get(synced.get(PRACTICE_LIST_KEY) as string)!.text)).toEqual(['c']);
});
it('recreates a deleted document and a list Rem that was moved elsewhere', async () => {
  const { typed, plugin, rems, synced } = setup();
  const first = await preparePracticeDocument(typed, ['a']);
  rems.get(synced.get(PRACTICE_LIST_KEY) as string)!.parent = 'elsewhere';
  await preparePracticeDocument(typed, ['b']);
  expect(plugin.rem.createRem).toHaveBeenCalledTimes(3);
  rems.delete(first._id);
  const replaced = await preparePracticeDocument(typed, ['c']);
  expect(replaced._id).not.toBe(first._id);
  expect(rems.get(synced.get(PRACTICE_LIST_KEY) as string)!.parent).toBe(replaced._id);
});
it('refuses an unverified list, empty or duplicate IDs, and the practice document itself', async () => {
  const { typed, plugin, rems } = setup();
  for (const ids of [[], ['a', 'a']]) await expect(preparePracticeDocument(typed, ids)).rejects.toThrow('unique');
  expect(plugin.rem.createRem).not.toHaveBeenCalled();
  const doc = await preparePracticeDocument(typed, ['a']);
  await expect(preparePracticeDocument(typed, [doc._id])).rejects.toThrow('itself');
  const list = [...rems.values()].find(rem => rem.parent === doc._id)!;
  list.setText.mockImplementation(async (text: unknown[]) => { list.text = text.slice(0, 2); });
  await expect(preparePracticeDocument(typed, ['a', 'b'])).rejects.toThrow('did not save');
});
it('opens the native flashcard screen for the practice document, never the global queue', async () => {
  const { typed, plugin, synced } = setup();
  await expect(openNativePractice(typed, 'kb-test', ['a', 'b'], 'queue')).resolves.toBe('queue');
  expect(plugin.window.setURL).toHaveBeenCalledExactlyOnceWith(`/flashcards/${synced.get(PRACTICE_DOC_KEY)}`);
  expect(plugin.window.openRem).not.toHaveBeenCalled();
});
it('opens the practice document for other native modes without navigating to a queue', async () => {
  const { typed, plugin, synced } = setup();
  await expect(openNativePractice(typed, 'kb-test', ['a'], 'modes')).resolves.toBe('document');
  expect(plugin.window.setURL).not.toHaveBeenCalled();
  expect(plugin.window.openRem).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ _id: synced.get(PRACTICE_DOC_KEY) }));
});
it.each([
  ['a rejected route', (p: ReturnType<typeof setup>['plugin']) => p.window.setURL.mockRejectedValue(new Error('Host route failure'))],
  ['a silent navigation failure', (p: ReturnType<typeof setup>['plugin']) => p.window.getURL.mockResolvedValue('/w/notes')],
])('falls back to the practice document after %s', async (_name, breakIt) => {
  const { typed, plugin } = setup(); breakIt(plugin);
  await expect(openNativePractice(typed, 'kb-test', ['a'], 'queue')).resolves.toBe('document');
  expect(plugin.window.setURL).toHaveBeenCalledTimes(1);
  expect(plugin.window.setURL).not.toHaveBeenCalledWith('/flashcards');
  expect(plugin.window.openRem).toHaveBeenCalledTimes(1);
});
it('refuses a changed knowledge base or invalid option before writing anything', async () => {
  const { typed, plugin } = setup();
  await expect(openNativePractice(typed, 'other-kb', ['a'], 'queue')).rejects.toThrow('knowledge base changed');
  await expect(openNativePractice(typed, 'kb-test', ['a'], 'invalid' as never)).rejects.toThrow('practice option');
  expect(plugin.rem.createRem).not.toHaveBeenCalled(); expect(plugin.window.setURL).not.toHaveBeenCalled();
});

it('clears the references after the queue closes, but not if a queue reopens or a new run starts', async () => {
  vi.useFakeTimers();
  try {
    const { typed, rems, synced } = setup();
    const errors: unknown[] = [];
    const cleanup = createPracticeCleanup(typed, e => errors.push(e), 2000);
    await preparePracticeDocument(typed, ['a', 'b']);
    const list = () => rems.get(synced.get(PRACTICE_LIST_KEY) as string)!;
    cleanup.queueExited(); cleanup.queueEntered();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refs(list().text)).toEqual(['a', 'b']);
    cleanup.queueExited(); cleanup.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refs(list().text)).toEqual(['a', 'b']);
    cleanup.queueExited();
    await vi.advanceTimersByTimeAsync(2000);
    expect(refs(list().text)).toEqual([]);
    expect(list().text[0]).toContain('Selected Rems: ');
    expect(errors).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it('clearNow removes leftovers once and is a no-op without a practice document', async () => {
  const { typed, plugin, rems, synced } = setup();
  await expect(clearPracticeSelection(typed)).resolves.toBe(false);
  expect(plugin.rem.createRem).not.toHaveBeenCalled();
  await preparePracticeDocument(typed, ['a']);
  const cleanup = createPracticeCleanup(typed, () => {});
  await expect(cleanup.clearNow()).resolves.toBe(true);
  await expect(cleanup.clearNow()).resolves.toBe(false);
  expect(refs(rems.get(synced.get(PRACTICE_LIST_KEY) as string)!.text)).toEqual([]);
});

it('saves a named practice set as a document with one reference per selected Rem, grouped under one parent', async () => {
  const { typed, rems, synced } = setup();
  const first = await savePracticeSet(typed, '  Exam   chapter 3 ', ['a', 'b']);
  expect(first.name).toBe('Exam chapter 3');
  const parent = rems.get(synced.get(PRACTICE_SETS_KEY) as string)!;
  expect(parent).toMatchObject({ text: [PRACTICE_SETS_TITLE], isDocument: true });
  const set = rems.get(first._id)!;
  expect(set).toMatchObject({ parent: parent._id, text: ['Exam chapter 3'], isDocument: true });
  const entries = [...rems.values()].filter(rem => rem.parent === set._id);
  expect(entries.map(rem => rem.text)).toEqual([[{ i: 'q', _id: 'a' }], [{ i: 'q', _id: 'b' }]]);
  expect(entries.map(rem => rem.setParent.mock.calls[0])).toEqual([[set._id, 0], [set._id, 1]]);
  const second = await savePracticeSet(typed, 'Hard cards', ['c']);
  expect(rems.get(second._id)!.parent).toBe(parent._id);
  expect([...rems.values()].filter(rem => rem.text[0] === PRACTICE_SETS_TITLE)).toHaveLength(1);
  // Saving a set never touches the temporary practice document.
  expect(synced.has(PRACTICE_DOC_KEY)).toBe(false);
});
it('refuses empty or overlong names and invalid selections before creating anything', async () => {
  const { typed, plugin } = setup();
  await expect(savePracticeSet(typed, '   ', ['a'])).rejects.toThrow('Enter a name');
  await expect(savePracticeSet(typed, 'x'.repeat(201), ['a'])).rejects.toThrow('at most 200');
  await expect(savePracticeSet(typed, 'Set', [])).rejects.toThrow('unique');
  await expect(savePracticeSet(typed, 'Set', ['a', 'a'])).rejects.toThrow('unique');
  expect(plugin.rem.createRem).not.toHaveBeenCalled();
});
it('reports an incomplete set when a reference is not saved', async () => {
  const { typed, plugin, make } = setup();
  let count = 0;
  plugin.rem.createRem.mockImplementation(async () => {
    const rem = make(`r-${++count}`);
    if (count === 4) rem.setText.mockImplementation(async () => { rem.text = ['lost']; });
    return rem;
  });
  await expect(savePracticeSet(typed, 'Set', ['a', 'b'])).rejects.toThrow('entry 2 of “Set”');
});
