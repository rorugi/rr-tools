import { expect, it } from 'vitest';
import { findDelimiter, MAX_LINES, splitLines } from './lines';

const red = (text: string) => ({ i: 'm' as const, text, tc: 1 });

it('splits at line breaks, trims each line, and drops empty lines', () => {
  expect(splitLines(['  one\r\ntwo\n\n  \nthree  '], false)).toEqual([
    { front: ['one'], text: 'one' }, { front: ['two'], text: 'two' }, { front: ['three'], text: 'three' },
  ]);
});
it('keeps colors and formatting when a run spans a line break', () => {
  expect(splitLines([{ i: 'm', text: 'a ', b: true }, red('red\nblue '), 'end'], false)).toEqual([
    { front: [{ i: 'm', text: 'a ', b: true }, red('red')], text: 'a red' },
    { front: [red('blue '), 'end'], text: 'blue end' },
  ]);
});
it.each([
  ['hund >> dog', 'forward'], ['hund << dog', 'backward'], ['hund <> dog', 'both'],
])('turns “%s” into a %s flashcard', (line, direction) => {
  expect(splitLines([line], true)).toEqual([{ front: ['hund'], back: ['dog'], direction, text: line }]);
});
it('splits formatted runs at the delimiter and keeps the formatting on both sides', () => {
  const [card] = splitLines([red('el perro'), ' >> ', { i: 'm', text: 'the dog', b: true }], true);
  expect(card).toEqual({ front: [red('el perro')], back: [{ i: 'm', text: 'the dog', b: true }], direction: 'forward', text: 'el perro >> the dog' });
  const [inside] = splitLines([red('a>>b')], true);
  expect(inside).toMatchObject({ front: [red('a')], back: [red('b')] });
});
it('uses the first delimiter and leaves later arrows in the back text', () => {
  expect(splitLines(['a >> b >> c'], true)[0]).toMatchObject({ front: ['a'], back: ['b >> c'], direction: 'forward' });
  expect(splitLines(['x <> y << z'], true)[0]).toMatchObject({ front: ['x'], back: ['y << z'], direction: 'both' });
});
it('leaves lines alone when flashcards are off, a side is empty, or the arrow is longer (>>> is RemNote multi-line)', () => {
  expect(splitLines(['a >> b'], false)).toEqual([{ front: ['a >> b'], text: 'a >> b' }]);
  for (const line of ['>> b', 'a >>', 'list >>>', 'a <<< b', 'a <<> b', 'a -> b']) {
    expect(splitLines([line], true)[0].back, line).toBeUndefined();
  }
  expect(findDelimiter('a >>> b >> c')).toEqual({ index: 8, direction: 'forward' });
});
it('limits the number of lines', () => {
  expect(splitLines([Array(MAX_LINES).fill('x').join('\n')], false)).toHaveLength(MAX_LINES);
  expect(() => splitLines([Array(MAX_LINES + 1).fill('x').join('\n')], false)).toThrow(`at most ${MAX_LINES}`);
});

const ids = () => { let n = 0; return () => `id${++n}`; };
it('turns {{…}} into cloze runs with one card per cloze', () => {
  const [line] = splitLines(['Die Hauptstadt von {{Österreich}} ist {{Wien}}.'], true, ids());
  expect(line).toEqual({ front: ['Die Hauptstadt von ', { i: 'm', text: 'Österreich', cId: 'id1' }, ' ist ', { i: 'm', text: 'Wien', cId: 'id2' }, '.'],
    clozes: 2, text: 'Die Hauptstadt von {{Österreich}} ist {{Wien}}.' });
});
it('groups Anki-style {{c1::…}} clozes, keeps hints, and handles answers that look like the prefix', () => {
  const [line] = splitLines(['{{c1::H}}{{c1::2}}{{c2::O::element}} and {{c3::c}}'], true, ids());
  expect(line.front).toEqual([{ i: 'm', text: 'H', cId: 'id1' }, { i: 'm', text: '2', cId: 'id1' },
    { i: 'm', text: 'O', cId: 'id2', 'cloze-hint': 'element' }, ' and ', { i: 'm', text: 'c', cId: 'id3' }]);
  expect(line.clozes).toBe(3);
});
it('keeps colors inside a cloze and takes precedence over arrows', () => {
  const [line] = splitLines([red('{{rojo}}'), ' >> red'], true, ids());
  expect(line).toMatchObject({ front: [{ i: 'm', text: 'rojo', tc: 1, cId: 'id1' }, ' >> red'], clozes: 1 });
  expect(line.back).toBeUndefined();
});
it('leaves braces alone when flashcards are off or the cloze is empty', () => {
  expect(splitLines(['{{a}}'], false)[0]).toEqual({ front: ['{{a}}'], text: '{{a}}' });
  expect(splitLines(['{{ }} and {{c1::}}'], true)[0].clozes).toBeUndefined();
});
