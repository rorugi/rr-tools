import type { RichTextElementTextInterface, RichTextInterface } from '@remnote/plugin-sdk';
import type { HeadingLevel } from './convert';

export type CardDirection = 'forward' | 'backward' | 'both';
/** One pasted line: a new Rem, optionally a flashcard with a back side and direction, or with cloze deletions. */
export type PasteLine = { front: RichTextInterface; back?: RichTextInterface; direction?: CardDirection; clozes?: number; heading?: HeadingLevel; tags?: string[]; text: string };
export type SplitOptions = { newId?: () => string; headings?: Record<number, HeadingLevel> };
export const MAX_LINES = 2000;

// RemNote's own flashcard delimiters: >> forward, << backward, <> two-way.
const DELIMITERS: Record<string, CardDirection> = { '>>': 'forward', '<<': 'backward', '<>': 'both' };

type Run = RichTextElementTextInterface;
const toRuns = (richText: RichTextInterface): Run[] => richText.flatMap(part =>
  typeof part === 'string' ? [{ i: 'm', text: part } as Run]
    : part && typeof part === 'object' && part.i === 'm' && typeof part.text === 'string' ? [part as Run] : []);
const plainOf = (runs: Run[]) => runs.map(run => run.text).join('');
const sameFormat = (a: Run, b: Run) => {
  const keys = (run: Run) => Object.keys(run).filter(key => key !== 'text').sort();
  const ka = keys(a), kb = keys(b);
  return ka.length === kb.length && ka.every((key, i) => key === kb[i] && (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
};
/** Adjacent runs with the same formatting are merged; plain unformatted runs go back as strings, as RemNote stores them. */
const fromRuns = (runs: Run[]): RichTextInterface => runs.filter(run => run.text)
  .reduce<Run[]>((out, run) => {
    const last = out[out.length - 1];
    // Separate clozes stay separate blanks, even within one group.
    if (last && !last.cId && sameFormat(last, run)) out[out.length - 1] = { ...last, text: last.text + run.text };
    else out.push(run);
    return out;
  }, [])
  .map(run => Object.keys(run).every(key => key === 'i' || key === 'text') ? run.text : run);

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

// {{answer}}, {{c1::answer}} or {{c1::answer::hint}} (Anki style; equal numbers in one line form one card).
const CLOZE = /\{\{(?:c(\d+)::)?([^{}]+?)\}\}/g;
const randomId = () => `rr${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** Turns {{…}} markup into RemNote cloze runs (cId, optional cloze-hint), keeping the formatting of the answer. */
export function applyClozes(runs: Run[], newId: () => string = randomId): { runs: Run[]; clozes: number } | undefined {
  const text = plainOf(runs);
  const groups = new Map<string, string>();
  const out: Run[] = [];
  let last = 0, clozes = 0;
  for (const match of text.matchAll(CLOZE)) {
    const [whole, group, inner] = match;
    const start = match.index!;
    const hintAt = group ? inner.indexOf('::') : -1;
    const answer = hintAt >= 0 ? inner.slice(0, hintAt) : inner;
    const hint = hintAt >= 0 ? inner.slice(hintAt + 2).trim() : '';
    // An empty numbered cloze ({{c1::}}) must not become a cloze containing “c1::”.
    if (!answer.trim() || !group && /^c\d+::/.test(inner)) continue;
    const answerStart = start + 2 + (group ? `c${group}::`.length : 0);
    let id = group ? groups.get(group) : undefined;
    if (!id) { id = newId(); clozes++; if (group) groups.set(group, id); }
    out.push(...slice(runs, last, start));
    out.push(...slice(runs, answerStart, answerStart + answer.length).map(run => ({ ...run, cId: id, ...(hint ? { 'cloze-hint': hint } : {}) })));
    last = start + whole.length;
  }
  if (!clozes) return undefined;
  out.push(...slice(runs, last, text.length));
  return { runs: out, clozes };
}

// RemNote's tag shortcut: ##tag anywhere in a line (no space after ##; “## Title” is a heading instead).
const TAG = /(^|\s)##([^\s#]+)/g;

/** Removes ##tag tokens (with one adjacent space) and returns the tag names; trailing punctuation stays in the text. */
export function extractTags(runs: Run[]): { runs: Run[]; tags: string[] } | undefined {
  const text = plainOf(runs);
  const tags: string[] = [];
  const cut: [number, number][] = [];
  for (const match of text.matchAll(TAG)) {
    const name = match[2].replace(/[.,;:!?)\]]+$/, '');
    if (!name) continue;
    let start = match.index!, end = start + match[1].length + 2 + name.length;
    // Drop the space before the tag, or after it when the tag starts the line.
    if (!match[1]) while (end < text.length && /\s/.test(text[end])) end++;
    if (!tags.some(tag => tag.toLowerCase() === name.toLowerCase())) tags.push(name);
    cut.push([start, end]);
  }
  if (!tags.length) return undefined;
  const kept: Run[] = [];
  let last = 0;
  for (const [start, end] of cut) { kept.push(...slice(runs, last, start)); last = end; }
  kept.push(...slice(runs, last, text.length));
  const rest = trim(kept);
  // A line of only tags stays text: there would be no Rem to put them on.
  return rest.length ? { runs: rest, tags } : undefined;
}

// Markdown headings: “# ”, “## ”, “### ” at the start of a line (a space is required, so #tag stays text).
const MARKDOWN_HEADING = /^(#{1,3})[ \t]+(?=\S)/;

/**
 * Splits converted rich text at line breaks into non-empty lines. Lines from <h1>–<h3> (options.headings) or
 * starting with Markdown #, ##, ### become headings; ##tag tokens become tags. With flashcards on, a line with {{…}} becomes a cloze card;
 * otherwise its first >>, << or <> splits it into a front and back.
 */
export function splitLines(richText: RichTextInterface, flashcards: boolean, options: SplitOptions = {}): PasteLine[] {
  const { newId, headings = {} } = options;
  const lines: Run[][] = [[]];
  for (const run of toRuns(richText)) {
    run.text.replace(/\r\n?/g, '\n').split('\n').forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  const result: PasteLine[] = [];
  for (const [index, raw] of lines.entries()) {
    let runs = trim(raw);
    if (!runs.length) continue;
    let heading = headings[index];
    const markdown = MARKDOWN_HEADING.exec(plainOf(runs));
    if (markdown) {
      heading = markdown[1].length as HeadingLevel;
      runs = trim(slice(runs, markdown[0].length, plainOf(runs).length));
    }
    const tagged = extractTags(runs);
    if (tagged) runs = tagged.runs;
    const text = plainOf(runs);
    const level = { ...(heading ? { heading } : {}), ...(tagged ? { tags: tagged.tags } : {}) };
    const cloze = flashcards ? applyClozes(runs, newId) : undefined;
    const card = flashcards && !cloze ? findDelimiter(text) : undefined;
    if (cloze) result.push({ front: fromRuns(cloze.runs), clozes: cloze.clozes, ...level, text });
    else if (card) {
      result.push({ front: fromRuns(trim(slice(runs, 0, card.index))), back: fromRuns(trim(slice(runs, card.index + 2, text.length))),
        direction: card.direction, ...level, text });
    } else result.push({ front: fromRuns(runs), ...level, text });
  }
  if (result.length > MAX_LINES) throw new Error(`The text has ${result.length} lines. Paste at most ${MAX_LINES} lines at a time.`);
  return result;
}
