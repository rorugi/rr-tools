import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { describeLines, insertLines } from './lines-insert';
import { readPasteSettings, DEFAULT_PASTE_SETTINGS } from './paste-settings';

type Fake = { _id: string; parent: string | null; position?: number; text: unknown[]; backText?: unknown[]; direction?: string;
  tags?: string[]; addTag: ReturnType<typeof vi.fn>; getTagRems: () => Promise<{ _id: string }[]>;
  setText: ReturnType<typeof vi.fn>; setFontSize: ReturnType<typeof vi.fn>; heading?: string; setBackText: ReturnType<typeof vi.fn>; setPracticeDirection: ReturnType<typeof vi.fn>; setParent: ReturnType<typeof vi.fn>;
  positionAmongstSiblings: () => Promise<number | undefined>; getChildrenRem: () => Promise<Fake[]> };
function setup() {
  const rems = new Map<string, Fake>();
  let next = 0;
  const make = (id: string, parent: string | null = null, text: unknown[] = []): Fake => {
    const rem: Fake = { _id: id, parent, text,
      setText: vi.fn(async (value: unknown[]) => { rem.text = value; }),
      setFontSize: vi.fn(async (value: string) => { rem.heading = value; }),
      addTag: vi.fn(async (value: string) => { rem.tags = [...rem.tags ?? [], value]; }),
      getTagRems: async () => (rem.tags ?? []).map(id => ({ _id: id })),
      setBackText: vi.fn(async (value: unknown[]) => { rem.backText = value; }),
      setPracticeDirection: vi.fn(async (value: string) => { rem.direction = value; }),
      setParent: vi.fn(async (value: string | null, position: number) => { rem.parent = value; rem.position = position; }),
      positionAmongstSiblings: async () => 4,
      getChildrenRem: async () => [...rems.values()].filter(child => child.parent === id) };
    rems.set(id, rem); return rem;
  };
  const plugin = {
    rem: { findOne: vi.fn(async (id: string) => rems.get(id)), createRem: vi.fn(async () => make(`new-${++next}`)),
      findByName: vi.fn(async (name: unknown[], parent: string | null) => [...rems.values()].find(rem => rem.parent === parent && rem.text.join('') === name.join(''))) },
    richText: { toString: async (text: unknown[]) => text.map(p => typeof p === 'string' ? p : (p as { text?: string }).text ?? '').join('') },
  };
  return { plugin, typed: plugin as unknown as ReactRNPlugin, rems, make };
}
const line = (text: string) => ({ front: [text], text });

it('adds lines as siblings directly below the caret Rem, in order', async () => {
  const { typed, rems, make } = setup();
  make('anchor', 'doc', ['existing']);
  await expect(insertLines(typed, { kind: 'after', remId: 'anchor', reuseEmpty: true }, [line('one'), line('two')]))
    .resolves.toEqual({ rems: 2, cards: 0, reused: false });
  expect(rems.get('anchor')!.text).toEqual(['existing']);
  expect(['new-1', 'new-2'].map(id => rems.get(id))).toMatchObject([{ parent: 'doc', position: 5, text: ['one'] }, { parent: 'doc', position: 6, text: ['two'] }]);
});
it('fills an empty caret Rem with the first line instead of leaving it empty', async () => {
  const { typed, plugin, rems, make } = setup();
  make('anchor', null, ['  ']);
  await expect(insertLines(typed, { kind: 'after', remId: 'anchor', reuseEmpty: true }, [line('one'), line('two')]))
    .resolves.toMatchObject({ rems: 2, reused: true });
  expect(rems.get('anchor')!.text).toEqual(['one']);
  expect(plugin.rem.createRem).toHaveBeenCalledTimes(1);
  expect(rems.get('new-1')).toMatchObject({ parent: null, position: 5, text: ['two'] });
});
it('appends to the end of a document for Multi-Paste', async () => {
  const { typed, rems, make } = setup();
  make('doc'); make('c1', 'doc'); make('c2', 'doc');
  await insertLines(typed, { kind: 'end', remId: 'doc' }, [line('one')]);
  expect(rems.get('new-1')).toMatchObject({ parent: 'doc', position: 2, text: ['one'] });
});
it('writes flashcards with back text and direction', async () => {
  const { typed, rems, make } = setup();
  make('doc');
  const result = await insertLines(typed, { kind: 'end', remId: 'doc' }, [
    { front: ['hund'], back: ['dog'], direction: 'both', text: 'hund <> dog' }, line('note'),
  ]);
  expect(result).toEqual({ rems: 2, cards: 1, reused: false });
  expect(rems.get('new-1')).toMatchObject({ text: ['hund'], backText: ['dog'], direction: 'both' });
  expect(rems.get('new-2')!.setBackText).not.toHaveBeenCalled();
  expect(describeLines(result)).toBe('Pasted 2 Rems (1 flashcard).');
  const cloze = await insertLines(typed, { kind: 'end', remId: 'doc' }, [{ front: ['a ', { i: 'm', text: 'b', cId: 'x' }], clozes: 1, text: 'a {{b}}' }]);
  expect(describeLines(cloze)).toBe('Pasted 1 Rem (1 flashcard).');
});
it('reports how far the paste got when a Rem is not created', async () => {
  const { typed, plugin, make } = setup();
  make('doc');
  let count = 0;
  plugin.rem.createRem.mockImplementation(async () => ++count === 2 ? undefined as unknown as Fake : make(`x${count}`));
  await expect(insertLines(typed, { kind: 'end', remId: 'doc' }, [line('one'), line('two')])).rejects.toThrow('Pasted 1 of 2 lines; check line 2 (“two”)');
  await expect(insertLines(typed, { kind: 'end', remId: 'missing' }, [line('one')])).rejects.toThrow('no longer exists');
  await expect(insertLines(typed, { kind: 'end', remId: 'doc' }, [])).rejects.toThrow('no text');
});
it('detects a line whose text was not saved', async () => {
  const { typed, plugin, make } = setup();
  make('doc');
  plugin.rem.createRem.mockImplementation(async () => {
    const rem = make('lossy');
    rem.setText.mockImplementation(async () => { rem.text = ['different']; });
    return rem;
  });
  await expect(insertLines(typed, { kind: 'end', remId: 'doc' }, [line('one')])).rejects.toThrow('did not save a pasted line');
});
it('remembers only valid paste settings and falls back field by field', () => {
  expect(readPasteSettings(undefined)).toEqual(DEFAULT_PASTE_SETTINGS);
  expect(readPasteSettings({ mode: 'exact', splitLines: true, flashcards: 'yes', headerRow: true, extra: 1 }))
    .toEqual({ mode: 'exact', headerRow: true, headerColumn: false, splitLines: true, flashcards: false });
  expect(readPasteSettings({ mode: 'neon' }).mode).toBe('palette');
});

it('sets the heading size for heading lines only', async () => {
  const { typed, rems, make } = setup();
  make('doc');
  await insertLines(typed, { kind: 'end', remId: 'doc' }, [{ front: ['Kapitel'], heading: 1, text: 'Kapitel' }, line('Text'), { front: ['Teil'], heading: 3, text: 'Teil' }]);
  expect(['new-1', 'new-2', 'new-3'].map(id => rems.get(id)!.heading)).toEqual(['H1', undefined, 'H3']);
  expect(rems.get('new-2')!.setFontSize).not.toHaveBeenCalled();
});

it('tags Rems, reusing existing tag Rems and creating missing ones once', async () => {
  const { typed, plugin, rems, make } = setup();
  make('doc'); make('tiere', null, ['Tiere']);
  const result = await insertLines(typed, { kind: 'end', remId: 'doc' }, [
    { front: ['perro'], tags: ['Tiere', 'Spanisch'], text: 'perro' }, { front: ['gato'], tags: ['Spanisch'], text: 'gato' }, line('plain'),
  ]);
  const spanisch = [...rems.values()].find(rem => rem.text[0] === 'Spanisch')!;
  expect(spanisch.parent).toBeNull();
  expect(rems.get('new-1')!.tags).toEqual(['tiere', spanisch._id]);
  expect(rems.get(['new-3', 'new-2'].find(id => rems.get(id)!.text[0] === 'gato')!)!.tags).toEqual([spanisch._id]);
  expect(plugin.rem.createRem).toHaveBeenCalledTimes(4); // 3 lines + 1 new tag
  expect(result).toMatchObject({ rems: 3, tagged: 2, newTags: ['Spanisch'] });
  expect(describeLines(result)).toBe('Pasted 3 Rems. 2 tagged. New tag: Spanisch.');
});
it('reports a tag that was not saved', async () => {
  const { typed, plugin, make } = setup();
  make('doc'); make('t', null, ['T']);
  plugin.rem.createRem.mockImplementation(async () => { const rem = make('x'); rem.addTag.mockResolvedValue(undefined); return rem; });
  await expect(insertLines(typed, { kind: 'end', remId: 'doc' }, [{ front: ['a'], tags: ['T'], text: 'a' }])).rejects.toThrow('did not save a pasted line');
});
