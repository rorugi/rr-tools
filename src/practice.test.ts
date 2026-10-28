// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { collectSelectedCards, scheduleOf, connectPractice, createPracticeService, PRACTICE_CONNECT, PRACTICE_CONNECTED, PRACTICE_SAVE, PRACTICE_SAVED, PRACTICE_START } from './practice';

function rem(id: string, direction = 'both', enabled = true) {
  return { getEnablePractice: vi.fn(async () => enabled), getPracticeDirection: vi.fn(async () => direction),
    getCards: vi.fn(async () => [
      { _id: `${id}-f`, remId: id, type: 'forward' },
      { _id: `${id}-b`, remId: id, type: 'backward' },
    ]), getDescendants: vi.fn(() => { throw new Error('Must not traverse descendants'); }) };
}
function setup(rems: Record<string, unknown> = { a: rem('a'), b: rem('b', 'backward') }) {
  const plugin = {
    kb: { getCurrentKnowledgeBaseData: vi.fn(async () => ({ _id: 'kb-test', name: 'Test' })) },
    rem: { findOne: vi.fn(async (id: string) => rems[id]) },
    editor: { getSelectedRem: vi.fn(async () => ({ remIds: ['a', 'b', 'a'] })) },
    window: { openWidgetInPane: vi.fn(async () => []), setURL: vi.fn(async (_url: string) => {}), getURL: vi.fn(async () => ''), openRem: vi.fn(async () => {}) },
    storage: { getSynced: vi.fn(async (_key: string): Promise<unknown> => undefined), setSynced: vi.fn(async () => {}) },
    widget: { openPopup: vi.fn(async () => {}), closePopup: vi.fn(async () => {}) },
    messaging: { broadcast: vi.fn(async (_message: unknown) => {}) },
    app: { toast: vi.fn(async (_message: string) => {}) },
  };
  return { plugin, typed: plugin as unknown as ReactRNPlugin };
}
afterEach(() => vi.useRealTimers());

it('collects only explicit selections, deduplicates, and respects enabled directions', async () => {
  const a = rem('a'), b = rem('b', 'backward'), other = rem('other');
  const { typed, plugin } = setup({ a, b, other });
  expect(await collectSelectedCards(typed, ['a', 'b', 'a'])).toEqual({
    selected: 2, skipped: 0, cardIds: ['a-f', 'a-b', 'b-b'], remIds: ['a', 'b'], errors: [], schedule: { due: 0, fresh: 3, later: 0 },
  });
  expect(plugin.rem.findOne.mock.calls).toEqual([['a'], ['b']]);
  expect(a.getDescendants).not.toHaveBeenCalled();
  expect(other.getCards).not.toHaveBeenCalled();
});
it('counts due, new and not-yet-due cards once each, treating reset cards as new', async () => {
  const now = 1_000_000;
  const seen = [{ score: 1 }];
  const mixed = { ...rem('m'), getCards: async () => [
    { _id: 'due', remId: 'm', type: 'forward', repetitionHistory: seen, nextRepetitionTime: now - 1 },
    { _id: 'due-now', remId: 'm', type: 'backward', repetitionHistory: seen, nextRepetitionTime: now },
    { _id: 'later', remId: 'm', type: { clozeId: '1' }, repetitionHistory: seen, nextRepetitionTime: now + 1 },
    { _id: 'new', remId: 'm', type: { clozeId: '2' } },
    { _id: 'reset', remId: 'm', type: { clozeId: '3' }, repetitionHistory: [{ score: 1 }, { score: 3 }], nextRepetitionTime: now + 9e9 },
    { _id: 'due', remId: 'm', type: 'forward', repetitionHistory: seen, nextRepetitionTime: now - 1 },
  ] };
  const { typed } = setup({ m: mixed });
  const result = await collectSelectedCards(typed, ['m'], now);
  expect(result.cardIds).toEqual(['due', 'due-now', 'later', 'new', 'reset']);
  expect(result.schedule).toEqual({ due: 2, fresh: 2, later: 1 });
  expect(scheduleOf({ repetitionHistory: seen }, now)).toBe('due');
});
it('skips disabled Rems, ordinary notes and inactive directions but includes cloze cards', async () => {
  const note = rem('note'); note.getCards.mockResolvedValue([]);
  const cloze = { ...rem('cloze', 'none'), getCards: async () => [{ _id: 'c1', remId: 'cloze', type: { clozeId: '1' } }] };
  const disabled = rem('disabled', 'both', false);
  const { typed } = setup({ note, cloze, disabled, none: rem('none', 'none') });
  expect(await collectSelectedCards(typed, ['disabled', 'note', 'none', 'cloze'])).toEqual({ selected: 4, skipped: 3, cardIds: ['c1'], remIds: ['cloze'], errors: [], schedule: { due: 0, fresh: 1, later: 0 } });
  expect(disabled.getCards).not.toHaveBeenCalled();
});
it('deduplicates card IDs and rejects a foreign card without leaking partial results from that Rem', async () => {
  const duplicate = { ...rem('a'), getCards: async () => [{ _id: 'a-f', remId: 'a', type: 'forward' }, { _id: 'a-f', remId: 'a', type: 'forward' }] };
  const invalid = { ...rem('b'), getCards: async () => [{ _id: 'b-f', remId: 'b', type: 'forward' }, { _id: 'x', remId: 'unselected', type: 'forward' }] };
  const { typed } = setup({ a: duplicate, b: invalid });
  const result = await collectSelectedCards(typed, ['a', 'b']);
  expect(result.cardIds).toEqual(['a-f']);
  expect(result.remIds).toEqual(['a']);
  expect(result.schedule).toEqual({ due: 0, fresh: 1, later: 0 });
  expect(result.errors[0]).toContain('Rem b:');
  expect(result.errors[0]).toContain('another Rem');
});
it('preserves actual per-Rem errors, missing IDs, and successful cards', async () => {
  const broken = { ...rem('bad'), getCards: async () => { throw new Error('Permission denied by host'); } };
  const { typed } = setup({ good: rem('good', 'forward'), bad: broken });
  const result = await collectSelectedCards(typed, ['good', 'bad', 'missing']);
  expect(result.cardIds).toEqual(['good-f']);
  expect(result.remIds).toEqual(['good']);
  expect(result.errors).toEqual(['Rem bad: Error: Permission denied by host', 'Rem missing: Error: RemNote returned no Rem for this ID.']);
});
it('does not open a practice view without a selection', async () => {
  const { typed, plugin } = setup();
  plugin.editor.getSelectedRem.mockResolvedValue({ remIds: [] });
  await createPracticeService(typed).open();
  expect(plugin.widget.openPopup).not.toHaveBeenCalled();
  expect(plugin.rem.findOne).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('Select Rems first'));
});
it('captures the original selection before moving focus and binds it to one view', async () => {
  const { typed, plugin } = setup();
  const service = createPracticeService(typed);
  await service.open();
  expect(plugin.widget.openPopup).toHaveBeenCalledWith('practice-selected', {}, false);
  expect(plugin.window.openWidgetInPane).not.toHaveBeenCalled();
  plugin.editor.getSelectedRem.mockResolvedValue({ remIds: ['unselected'] });
  await service.handle({ message: { type: PRACTICE_CONNECT, connectionId: 'one' } });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ cardIds: ['a-f', 'a-b', 'b-b'] }) }));
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'two' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ selection: undefined, error: expect.stringContaining('unavailable') }));
  service.clear();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ selection: undefined }));
  expect(plugin.rem.findOne).toHaveBeenCalledTimes(2);
});
it('does not keep a selection when opening the setup popup fails', async () => {
  const { typed, plugin } = setup();
  plugin.widget.openPopup.mockRejectedValue(new Error('Could not open popup'));
  const service = createPracticeService(typed);
  await expect(service.open()).rejects.toThrow('Could not open popup');
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ selection: undefined }));
});
function practiceDocument(plugin: ReturnType<typeof setup>['plugin'], rems: Record<string, unknown>) {
  let list: { _id: string; parent: string; text: unknown[] } | undefined;
  const doc = { _id: 'practice-doc', parent: null, setText: vi.fn(async () => {}), setIsDocument: vi.fn(async () => {}) };
  Object.assign(plugin.rem, { createRem: vi.fn(async () => {
    if (!rems['practice-doc']) { rems['practice-doc'] = doc; return doc; }
    const created = { _id: 'practice-list', parent: '', text: [] as unknown[],
      setParent: vi.fn(async (parent: string) => { created.parent = parent; }), setText: vi.fn(async (text: unknown[]) => { created.text = text; }) };
    list = created; rems['practice-list'] = created; return created;
  }) });
  return { doc, list: () => list };
}
it('rejects expired start requests and keeps the setup popup open on launch errors', async () => {
  const { typed, plugin } = setup();
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const reply = plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string } };
  await service.handle({ type: PRACTICE_START, jobId: 'expired', target: 'queue' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('expired') }));
  plugin.kb.getCurrentKnowledgeBaseData.mockResolvedValue({ _id: 'other-kb', name: 'Other' });
  await service.handle({ type: PRACTICE_START, jobId: reply.selection.jobId, target: 'queue' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('knowledge base changed') }));
  expect(plugin.widget.closePopup).not.toHaveBeenCalled();
  expect(plugin.window.setURL).not.toHaveBeenCalled();
});
it("opens RemNote's flashcard screen for the captured Rems once and closes only after navigation", async () => {
  const rems: Record<string, unknown> = { a: rem('a'), b: rem('b', 'backward') };
  const { typed, plugin } = setup(rems);
  const practice = practiceDocument(plugin, rems);
  const order: string[] = [];
  let url = '';
  plugin.window.setURL.mockImplementation(async (route: string) => {
    order.push('navigate');
    expect(practice.list()!.text).toEqual(['Selected Rems: ', { i: 'q', _id: 'a' }, ', ', { i: 'q', _id: 'b' }]);
    url = route;
  });
  plugin.window.getURL.mockImplementation(async () => url);
  plugin.widget.closePopup.mockImplementation(async () => { order.push('close'); });
  const cleanup = { cancel: vi.fn() };
  const service = createPracticeService(typed, cleanup);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const reply = plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string } };
  plugin.editor.getSelectedRem.mockResolvedValue({ remIds: ['other'] });
  const request = { type: PRACTICE_START, jobId: reply.selection.jobId, target: 'queue' };
  await Promise.all([service.handle(request), service.handle(request)]);
  expect(plugin.window.setURL).toHaveBeenCalledExactlyOnceWith('/flashcards/practice-doc');
  expect(order).toEqual(['navigate', 'close']);
  expect(plugin.window.openWidgetInPane).not.toHaveBeenCalled();
  expect(plugin.widget.openPopup).toHaveBeenCalledTimes(1);
  expect(plugin.app.toast).not.toHaveBeenCalled();
  expect(cleanup.cancel).toHaveBeenCalledTimes(1);
});
it('opens the practice document for other modes and tells the user where to choose one', async () => {
  const rems: Record<string, unknown> = { a: rem('a'), b: rem('b', 'backward') };
  const { typed, plugin } = setup(rems);
  practiceDocument(plugin, rems);
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const reply = plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string } };
  await service.handle({ type: PRACTICE_START, jobId: reply.selection.jobId, target: 'modes' });
  expect(plugin.window.setURL).not.toHaveBeenCalled();
  expect(plugin.window.openRem).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ _id: 'practice-doc' }));
  expect(plugin.widget.closePopup).toHaveBeenCalledWith(false);
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('arrow beside Practice'));
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: undefined }));
});
it('saves one practice set per selection, then opens it on request', async () => {
  const rems: Record<string, unknown> = { a: rem('a'), b: rem('b', 'backward') };
  const { typed, plugin } = setup(rems);
  let next = 0;
  const createRem = vi.fn(async () => {
    const created = { _id: `r${++next}`, parent: null as string | null, text: [] as unknown[],
      setParent: vi.fn(async (parent: string) => { created.parent = parent; }), setText: vi.fn(async (text: unknown[]) => { created.text = text; }), setIsDocument: vi.fn(async () => {}) };
    rems[created._id] = created; return created;
  });
  Object.assign(plugin.rem, { createRem });
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const jobId = (plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string } }).selection.jobId;
  await service.handle({ type: PRACTICE_START, jobId, target: 'set' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'Save the practice set first.' }));
  const save = { type: PRACTICE_SAVE, jobId, name: 'Exam' };
  await Promise.all([service.handle(save), service.handle(save)]);
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith({ type: PRACTICE_SAVED, jobId, result: { _id: 'r2', name: 'Exam', added: 2, already: 0 }, error: undefined });
  // Parent + set + two entries, created once despite the double click.
  expect(createRem).toHaveBeenCalledTimes(4);
  expect(plugin.widget.closePopup).not.toHaveBeenCalled();
  await service.handle({ type: PRACTICE_START, jobId, target: 'set' });
  expect(plugin.window.openRem).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ _id: 'r2' }));
  expect(plugin.widget.closePopup).toHaveBeenCalledWith(false);
  expect(plugin.window.setURL).not.toHaveBeenCalled();
});
it('offers the existing sets and adds the selection to the chosen one', async () => {
  const rems: Record<string, unknown> = { a: rem('a'), b: rem('b', 'backward') };
  const { typed, plugin } = setup(rems);
  const entry = (id: string, parent: string, ref: string) => ({ _id: id, parent, text: [{ i: 'q', _id: ref }] });
  const exam = { _id: 'exam', parent: 'sets', text: ['Exam'], isDocument: async () => true,
    getChildrenRem: async () => [entry('e1', 'exam', 'a')] };
  rems.sets = { _id: 'sets', parent: null, text: ['RR Tools – Practice Sets'],
    getChildrenRem: async () => [exam, { _id: 'note', isDocument: async () => false }] };
  rems.exam = exam;
  plugin.storage.getSynced.mockImplementation(async (key: string) => key === 'practiceSetsParent' ? 'sets' : undefined);
  const created: { _id: string; parent?: string; position?: number; text?: unknown[] }[] = [];
  Object.assign(plugin.rem, { createRem: vi.fn(async () => {
    const child = { _id: `new${created.length}`, setParent: vi.fn(async (parent: string, position: number) => { child.parent = parent; child.position = position; }),
      setText: vi.fn(async (text: unknown[]) => { child.text = text; }) } as { _id: string; parent?: string; position?: number; text?: unknown[]; setParent: unknown; setText: unknown };
    created.push(child); rems[child._id] = child; return child;
  }) });
  Object.assign(plugin, { richText: { toString: async (text: unknown[]) => text.filter(p => typeof p === 'string').join('') } });
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const selection = (plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string; sets: unknown } }).selection;
  expect(selection.sets).toEqual([{ _id: 'exam', name: 'Exam' }]);
  await service.handle({ type: PRACTICE_SAVE, jobId: selection.jobId, setId: 'exam' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith({ type: PRACTICE_SAVED, jobId: selection.jobId, result: { _id: 'exam', name: 'Exam', added: 1, already: 1 }, error: undefined });
  expect(created).toMatchObject([{ parent: 'exam', position: 1, text: [{ i: 'q', _id: 'b' }] }]);
  await service.handle({ type: PRACTICE_START, jobId: selection.jobId, target: 'set' });
  expect(plugin.window.openRem).toHaveBeenCalledExactlyOnceWith(exam);
});
it('still opens the popup when the practice sets cannot be listed', async () => {
  const { typed, plugin } = setup();
  plugin.storage.getSynced.mockRejectedValue(new Error('storage unavailable'));
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ sets: [] }) }));
});
it('reports save errors and allows a corrected retry', async () => {
  const { typed, plugin } = setup();
  const service = createPracticeService(typed);
  await service.open();
  await service.handle({ type: PRACTICE_CONNECT, connectionId: 'one' });
  const jobId = (plugin.messaging.broadcast.mock.calls.at(-1)![0] as { selection: { jobId: string } }).selection.jobId;
  await service.handle({ type: PRACTICE_SAVE, jobId, name: ' ' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ type: PRACTICE_SAVED, error: expect.stringContaining('Enter a name') }));
  plugin.kb.getCurrentKnowledgeBaseData.mockResolvedValue({ _id: 'other-kb', name: 'Other' });
  await service.handle({ type: PRACTICE_SAVE, jobId, name: 'Exam' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('knowledge base changed') }));
  await service.handle({ type: PRACTICE_SAVE, jobId: 'expired', name: 'Exam' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('expired') }));
});
it('client correlates replies and removes its listener without needing widget context', async () => {
  let listener = (_event: unknown) => {};
  const selection = { selected: 1, skipped: 0, cardIds: ['a-f'], errors: [] };
  const plugin = {
    event: { addListener: vi.fn((_event, _key, fn) => { listener = fn; }), removeListener: vi.fn() },
    messaging: { broadcast: vi.fn(async ({ connectionId }: { connectionId: string }) => {
      listener({ message: { type: PRACTICE_CONNECTED, connectionId: 'wrong', selection: { cardIds: ['wrong'] } } });
      listener({ message: { type: PRACTICE_CONNECTED, connectionId, selection } });
    }) },
  };
  await expect(connectPractice(plugin as unknown as ReactRNPlugin).result).resolves.toEqual(selection);
  expect(plugin.event.removeListener).toHaveBeenCalledTimes(1);
});
it('cleans up after timeout and cancellation', async () => {
  vi.useFakeTimers();
  const plugin = { event: { addListener: vi.fn(), removeListener: vi.fn() }, messaging: { broadcast: vi.fn(async () => {}) } };
  const timed = connectPractice(plugin as unknown as ReactRNPlugin);
  const timeout = expect(timed.result).rejects.toThrow('No reply from RR Tools');
  await vi.advanceTimersByTimeAsync(5000); await timeout;
  const canceled = connectPractice(plugin as unknown as ReactRNPlugin);
  const cancellation = expect(canceled.result).rejects.toThrow('Practice view closed');
  canceled.cancel(); await cancellation;
  expect(plugin.event.removeListener).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
