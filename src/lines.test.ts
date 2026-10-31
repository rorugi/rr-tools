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
