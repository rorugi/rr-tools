import type { RichTextElementTextInterface, RichTextInterface } from '@remnote/plugin-sdk';
import { colord, extend } from 'colord';
import names from 'colord/plugins/names';
extend([names]);

export type ColorMode = 'palette' | 'exact' | 'plain';
export const MAX_INPUT = 500_000;
// Representative swatches, NOT RemNote's theme-dependent rendered RGB values.
export const PALETTE = [
  { id: 1, name: 'Red', hex: '#ff0000' }, { id: 2, name: 'Orange', hex: '#ff8000' },
  { id: 3, name: 'Yellow', hex: '#ffff00' }, { id: 4, name: 'Green', hex: '#008000' },
  { id: 5, name: 'Purple', hex: '#800080' }, { id: 6, name: 'Blue', hex: '#0000ff' },
  { id: 7, name: 'Gray', hex: '#808080' }, { id: 8, name: 'Brown', hex: '#804000' },
  { id: 9, name: 'Pink', hex: '#ff80c0' },
];
type Format = Omit<RichTextElementTextInterface, 'i' | 'text'>;
export type HeadingLevel = 1 | 2 | 3;
/** headings: line number (0-based, counted at every line break of `text`) → heading level from <h1>–<h3>. */
export type Conversion = { richText: RichTextInterface; text: string; warnings: string[]; coloredRuns: number; headings?: Record<number, HeadingLevel> };

export function colorValue(value: string, mode: ColorMode): string | number | undefined {
  if (mode === 'plain') return undefined;
  const color = colord(value);
  if (!color.isValid() || color.alpha() !== 1) return undefined;
  if (mode === 'exact') return color.toHex();
  const rgb = color.toRgb();
  // Near black/white are usually document defaults; retain theme readability.
  if (Math.max(rgb.r, rgb.g, rgb.b) < 32 || Math.min(rgb.r, rgb.g, rgb.b) > 235) return undefined;
  // Preserve the color family: RGB distance to saturated swatches made Word's
  // medium blue gray and ochre brown, losing the meaning of colored endings.
  const { h, s, l } = color.toHsl();
  if (s < 15) return 7;
  if (h < 15 || h >= 345) return l > 70 ? 9 : 1;
  if (h < 45) return l < 38 ? 8 : 2;
  if (h < 75) return 3;
  if (h < 170) return 4;
  if (h < 260) return 6;
  if (h < 320) return l > 65 ? 9 : 5;
  return 9;
}

const BLOCKS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'TABLE', 'SECTION', 'ARTICLE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT']);

export function convertClipboard(html: string, plain: string, mode: ColorMode = 'palette'): Conversion {
  if (html.length > MAX_INPUT || plain.length > MAX_INPUT) throw new Error('Clipboard is too large. Copy a smaller selection (under 500,000 characters).');
  if (!html && !plain) return { text: '', richText: [], coloredRuns: 0, warnings: [] };
  if (!html || mode === 'plain') {
    const text = plain || convertClipboard(html, '', 'exact').text;
    return { text, richText: text ? [text] : [], coloredRuns: 0, warnings: html ? [] : ['Clipboard contains no HTML; colors cannot be recovered from plain text.'] };
  }
  // A disconnected template is inert: scripts, events, images and styles are never mounted.
  const template = document.createElement('template');
  template.innerHTML = html;
  const warnings = new Set<string>();
  const runs: RichTextElementTextInterface[] = [];
  let visited = 0;
  const headings: Record<number, HeadingLevel> = {};
  let line = 0;
  let heading: HeadingLevel | undefined;
  const emit = (text: string, format: Format = {}, pre = false) => {
    if (!pre) {
      text = text.replace(/[\t\r\n ]+/g, ' ');
      if (!runs.length || /[\n ]$/.test(runs[runs.length - 1].text)) text = text.replace(/^ +/, '');
    }
    if (!text) return;
    if (heading && text.trim()) headings[line] ??= heading;
    line += text.split('\n').length - 1;
    runs.push({ i: 'm', text, ...format });
  };
  const newline = () => {
    if (runs.length && !runs[runs.length - 1].text.endsWith('\n')) emit('\n', {}, true);
  };
  const visit = (node: Node, inherited: Format, pre: boolean, depth: number, cellStart?: number) => {
    if (++visited > 30_000 || depth > 100) throw new Error('Clipboard HTML is too complex. Copy a smaller selection.');
    if (node.nodeType === Node.TEXT_NODE) { emit(node.textContent || '', inherited, pre); return; }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (SKIP.has(tag)) {
      if (tag === 'STYLE' || tag === 'LINK') warnings.add('Stylesheets are not imported. Class-only colors may be lost; inline colors are supported.');
      return;
    }
    const style = node.style;
    if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return;
    if (tag === 'IMG') { warnings.add('Images are omitted.'); return; }
    if (tag === 'BR') { emit('\n', {}, true); return; }
    if (tag === 'TABLE') warnings.add('Tables are flattened to text; cells are separated by tabs.');
    if (node.className) warnings.add('CSS classes are not evaluated. Only inline or inherited inline colors are imported.');
    const format: Format = { ...inherited };
    if (tag === 'B' || tag === 'STRONG') format.b = true;
    if (tag === 'I' || tag === 'EM') format.l = true;
    if (tag === 'U') format.u = true;
    if (tag === 'CODE') format.code = true;
    if (style.fontWeight) format.b = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600;
    if (style.fontStyle) format.l = ['italic', 'oblique'].includes(style.fontStyle);
    if (style.textDecoration || style.textDecorationLine) format.u = `${style.textDecoration} ${style.textDecorationLine}`.includes('underline');
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:\/\/|mailto:)/i.test(href)) format.url = href;
      else delete format.url;
    }
    const rawColor = style.color || (tag === 'FONT' ? node.getAttribute('color') || '' : '');
    if (rawColor && rawColor !== 'inherit' && rawColor !== 'currentcolor') {
      delete format.tc;
      const color = colorValue(rawColor, mode);
      if (color !== undefined) format.tc = color;
      else if (!colord(rawColor).isValid() || colord(rawColor).alpha() !== 1) warnings.add('Unsupported, transparent, or variable colors were omitted.');
    }
    if (style.backgroundColor || style.background) warnings.add('Background highlights are not imported; this plugin preserves foreground text color.');
    const block = BLOCKS.has(tag);
    const cell = tag === 'TD' || tag === 'TH';
    const start = cell ? runs.length : cellStart;
    if (block && runs.length > (start ?? 0)) newline();
    // Word and web pages mark headings as <h1>–<h3>; remember the line so it can become a RemNote heading.
    const outerHeading = heading;
    if (tag === 'H1' || tag === 'H2' || tag === 'H3') heading = Number(tag[1]) as HeadingLevel;
    for (const child of Array.from(node.childNodes)) visit(child, format, pre || tag === 'PRE' || style.whiteSpace.startsWith('pre'), depth + 1, start);
    heading = outerHeading;
    if (cell) {
      // Word wraps each table cell in paragraphs; keep the row on one line.
      if (runs.length > (start ?? 0) && runs.at(-1)?.text === '\n') runs.pop();
      if (node.nextElementSibling?.matches('td,th')) emit('\t', {}, true);
    }
    if (block) newline();
  };
  for (const node of Array.from(template.content.childNodes)) visit(node, {}, false, 0);
  // Drop only the synthetic final block separator (not meaningful explicit BRs).
  const last = template.content.lastElementChild;
  if (last && BLOCKS.has(last.tagName) && runs.at(-1)?.text === '\n') runs.pop();
  const text = runs.map((run) => run.text).join('');
  if (!text && plain) return { text: plain, richText: [plain], coloredRuns: 0, warnings: ['No supported text in HTML; using the plain-text clipboard representation.'] };
  if (mode === 'palette') warnings.add('Colors are approximated to RemNote’s nine named colors. Near-black/white use the editor default.');
  else warnings.add('Exact shades may not display or persist in every RemNote version. Check the inserted text; use the palette if colors disappear.');
  return { richText: runs, text, warnings: [...warnings], coloredRuns: runs.filter((r) => r.tc !== undefined).length,
    ...(Object.keys(headings).length ? { headings } : {}) };
}
