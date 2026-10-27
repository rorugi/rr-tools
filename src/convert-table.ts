import type { RichTextInterface } from '@remnote/plugin-sdk';
import { convertClipboard, type Conversion, type ColorMode } from './convert';

export type TableCell = { richText: RichTextInterface; text: string; rowSpan: number; colSpan: number; header: boolean; headerScope?: 'row' | 'col' };
export type TableHeaders = { headerRow: boolean; headerColumn: boolean };
export type TablePart = { kind: 'table'; rows: TableCell[][] } | { kind: 'text'; richText: RichTextInterface; text: string };
export type TablePaste = { parts: TablePart[]; tableCount: number; cellCount: number };
export type PasteConversion = Conversion & { table?: TablePaste };
export const MAX_TABLE_CELLS = 500;

/** Preserve table boundaries; use the existing color converter for each cell. */
export function convertPaste(html: string, plain: string, mode: ColorMode, headers: TableHeaders = { headerRow: false, headerColumn: false }): PasteConversion {
  const flat = convertClipboard(html, plain, mode); // Also enforces input/node/depth limits.
  if (!html || !/<table[\s>]/i.test(html)) return flat;
  const template = document.createElement('template');
  template.innerHTML = html;
  const parts: TablePart[] = [];
  const warnings = new Set<string>();
  let tableCount = 0, cellCount = 0, coloredRuns = 0, gridArea = 0;
  const visible = (node: Node) => {
    for (let el = node instanceof HTMLElement ? node : node.parentElement; el; el = el.parentElement) {
      if (el.hidden || el.style.display === 'none' || el.style.visibility === 'hidden') return false;
    }
    return true;
  };
  const convertNode = (node: Node) => {
    // Shallow ancestors retain inherited inline colors/formatting without other cells.
    let copy = node.cloneNode(true);
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const wrapper = parent.cloneNode(false); wrapper.appendChild(copy); copy = wrapper;
    }
    const wrapper = document.createElement('div'); wrapper.appendChild(copy);
    const value = convertClipboard(wrapper.innerHTML, '', mode);
    value.warnings.filter(w => !w.startsWith('Tables are flattened')).forEach(w => warnings.add(w));
    coloredRuns += value.coloredRuns;
    return value;
  };
  const walk = (node: Node) => {
    if (!visible(node)) return;
    if (node instanceof HTMLElement && node.tagName === 'TABLE') {
      if (node.querySelector('table')) throw new Error('Nested tables are not supported yet. Copy the inner table separately.');
      const rowElements = Array.from(node.querySelectorAll('tr')).filter(visible);
      const rows: TableCell[][] = rowElements.map(row => Array.from(row.children)
        .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement && visible(cell))
        .map(cell => {
          if (++cellCount > MAX_TABLE_CELLS) throw new Error(`Copy a smaller table (at most ${MAX_TABLE_CELLS} cells).`);
          if (cell.rowSpan === 0 || cell.rowSpan > 500 || cell.colSpan > 500) throw new Error('This table contains an unsupported merged-cell span. Copy a smaller, unmerged selection.');
          gridArea += cell.rowSpan * cell.colSpan;
          if (gridArea > 5000) throw new Error('The merged table grid is too large. Copy a smaller selection.');
          const value = convertNode(cell);
          return { richText: value.richText, text: value.text, rowSpan: cell.rowSpan, colSpan: cell.colSpan, header: false };
        }));
      if (!rows.some(row => row.length)) return;
      const caption = node.querySelector('caption');
      if (caption) { const value = convertNode(caption); if (value.text) parts.push({kind:'text',richText:value.richText,text:value.text}); }
      tableCount++; parts.push({ kind: 'table', rows: applyTableHeaders(rows, headers) });
    } else if (node instanceof HTMLElement && node.querySelector('table')) {
      Array.from(node.childNodes).forEach(walk);
    } else {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return;
      const value = convertNode(node);
      if (value.text) parts.push({ kind: 'text', richText: value.richText, text: value.text });
    }
  };
  Array.from(template.content.childNodes).forEach(walk);
  if (!tableCount) return flat;
  warnings.add('The table will be added inside a new “Pasted table” Rem under your destination. Existing text is kept.');
  warnings.add('Table structure is imported first; cell colors are then applied and checked. This client’s table API support still needs your test.');
  return { ...flat, coloredRuns, warnings: [...warnings], table: { parts, tableCount, cellCount } };
}

/** Locate the actual first grid column, including cells occupied by row spans. */
export function applyTableHeaders(rows: TableCell[][], options: TableHeaders): TableCell[][] {
  const occupiedUntil: number[] = [];
  return rows.map((row, rowIndex) => {
    let column = 0;
    return row.map(cell => {
      while ((occupiedUntil[column] || 0) > rowIndex) column++;
      const headerScope = options.headerRow && rowIndex === 0 ? 'col'
        : options.headerColumn && column === 0 ? 'row' : undefined;
      for (let offset = 0; offset < cell.colSpan; offset++) occupiedUntil[column + offset] = rowIndex + cell.rowSpan;
      column += cell.colSpan;
      return { ...cell, header: !!headerScope, headerScope };
    });
  });
}
