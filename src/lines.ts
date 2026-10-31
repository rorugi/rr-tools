import type { RichTextElementTextInterface, RichTextInterface } from '@remnote/plugin-sdk';

export type CardDirection = 'forward' | 'backward' | 'both';
/** One pasted line: a new Rem, optionally a flashcard with a back side and direction. */
export type PasteLine = { front: RichTextInterface; back?: RichTextInterface; direction?: CardDirection; text: string };
export const MAX_LINES = 2000;

// RemNote's own flashcard delimiters: >> forward, << backward, <> two-way.
const DELIMITERS: Record<string, CardDirection> = { '>>': 'forward', '<<': 'backward', '<>': 'both' };

type Run = RichTextElementTextInterface;
const toRuns = (richText: RichTextInterface): Run[] => richText.flatMap(part =>
  typeof part === 'string' ? [{ i: 'm', text: part } as Run]
    : part && typeof part === 'object' && part.i === 'm' && typeof part.text === 'string' ? [part as Run] : []);
const plainOf = (runs: Run[]) => runs.map(run => run.text).join('');
/** Plain unformatted runs go back as strings, as RemNote stores them. */
const fromRuns = (runs: Run[]): RichTextInterface => runs.filter(run => run.text).map(run =>
  Object.keys(run).every(key => key === 'i' || key === 'text') ? run.text : run);

/** Runs between two character offsets of the line, keeping each run's formatting. */
function slice(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  let offset = 0;
  for (const run of runs) {
    const from = Math.max(start, offset), to = Math.min(end, offset + run.text.length);
    if (from < to) out.push({ ...run, text: run.text.slice(from - offset, to - offset) });
    offset += run.text.length;
  }
  return out;
}
function trim(runs: Run[]): Run[] {
  const text = plainOf(runs);
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  return start < end ? slice(runs, start, end) : [];
}

/**
 * The first flashcard delimiter that is not part of a longer arrow such as >>> (RemNote's multi-line card)
 * and has text on both sides.
 */
export function findDelimiter(text: string): { index: number; direction: CardDirection } | undefined {
  for (let i = 0; i < text.length - 1; i++) {
    const direction = DELIMITERS[text.slice(i, i + 2)];
    if (!direction || /[<>]/.test(text[i - 1] ?? '') || /[<>]/.test(text[i + 2] ?? '')) continue;
    if (text.slice(0, i).trim() && text.slice(i + 2).trim()) return { index: i, direction };
  }
  return undefined;
}

/** Splits converted rich text at line breaks into non-empty lines; optionally turns delimiter lines into flashcards. */
export function splitLines(richText: RichTextInterface, flashcards: boolean): PasteLine[] {
  const lines: Run[][] = [[]];
  for (const run of toRuns(richText)) {
    run.text.replace(/\r\n?/g, '\n').split('\n').forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  const result: PasteLine[] = [];
  for (const raw of lines) {
    const runs = trim(raw);
    if (!runs.length) continue;
    const text = plainOf(runs);
    const card = flashcards ? findDelimiter(text) : undefined;
    if (card) {
      result.push({ front: fromRuns(trim(slice(runs, 0, card.index))), back: fromRuns(trim(slice(runs, card.index + 2, text.length))),
        direction: card.direction, text });
    } else result.push({ front: fromRuns(runs), text });
  }
  if (result.length > MAX_LINES) throw new Error(`The text has ${result.length} lines. Paste at most ${MAX_LINES} lines at a time.`);
  return result;
}
