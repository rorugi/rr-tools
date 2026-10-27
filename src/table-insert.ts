import { RemType } from '@remnote/plugin-sdk';
import type { ReactRNPlugin, RichTextInterface, RichTextElementTextInterface } from '@remnote/plugin-sdk';
import type { TablePaste } from './convert-table';

type RemObject = NonNullable<Awaited<ReturnType<ReactRNPlugin['rem']['findOne']>>>;
const textOf = (value: RichTextInterface | undefined) => (value || []).map(run => typeof run === 'string' ? run : 'text' in run ? run.text : '').join('');
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
// Compare meaningful formats, allowing the host to merge adjacent runs or use plain strings.
function signature(value: RichTextInterface | undefined) {
  const parts: {text: string; format: string}[] = [];
  for (const item of value || []) {
    const run: Partial<RichTextElementTextInterface> = typeof item === 'string' ? {text:item} : item as RichTextElementTextInterface;
    const format = JSON.stringify([run.tc || null, !!run.b, !!run.l, !!run.u, !!run.code, run.url || null]);
    if (!run.text) continue;
    if (parts.at(-1)?.format === format) parts[parts.length - 1].text += run.text;
    else parts.push({text:run.text,format});
  }
  return JSON.stringify(parts);
}

/** Native HTML import supplies structure; explicit SDK rich-text writes supply colors.
 * Unique temporary markers identify cells even when their visible text is identical.
 * Work is isolated to a newly created subtree; no matching by existing user text.
 */
export async function insertColoredTable(plugin: ReactRNPlugin, destination: string, table: TablePaste): Promise<string> {
  if (!table.parts.length || table.cellCount < 1 || table.cellCount > 500) throw new Error('Invalid or oversized table payload.');
  const prefix = `RRCP${crypto.randomUUID().replace(/-/g, '')}X`;
  const values: RichTextInterface[] = [];
  const token = (text: RichTextInterface) => `${prefix}${values.push(text) - 1}Z`;
  let cells = 0;
  // Generate only allowlisted structure and internal ASCII markers; source HTML is never sent.
  const html = table.parts.map(part => {
    if (part.kind === 'text') return `<p>${token(part.richText)}</p>`;
    return '<table><tbody>' + part.rows.map(row => '<tr>' + row.map(cell => {
      if (!Number.isInteger(cell.rowSpan) || !Number.isInteger(cell.colSpan) || cell.rowSpan < 1 || cell.colSpan < 1 || cell.rowSpan > 500 || cell.colSpan > 500) throw new Error('Invalid table cell span.');
      cells++;
      const tag = cell.header ? 'th' : 'td';
      const scope = cell.header && (cell.headerScope === 'row' || cell.headerScope === 'col') ? ` scope="${cell.headerScope}"` : '';
      return `<${tag}${scope} rowspan="${cell.rowSpan}" colspan="${cell.colSpan}">${token(cell.richText)}</${tag}>`;
    }).join('') + '</tr>').join('') + '</tbody></table>';
  }).join('');
  if (cells !== table.cellCount || values.length > 1000) throw new Error('Invalid table cell count.');
  const container = await plugin.rem.createRem();
  if (!container) throw new Error('RemNote did not create a table container. Nothing was imported.');
  const errors: string[] = [];
  const restored = new Set<number>();
  let tableCount = 0;
  try {
    await container.setText(['Pasted table']);
    await container.setParent(destination);
    try { await plugin.richText.parseAndInsertHtml(html, container._id); }
    catch (error) { errors.push(`Import: ${describe(error)}`); }
    // Even if import reports an error, recover any partially imported cell markers.
    const candidates = new Map<string, RemObject>();
    const add = (rems: RemObject[]) => {
      for (const rem of rems) candidates.set(rem._id, rem);
      if (candidates.size > 5000) throw new Error('The imported subtree is unexpectedly large; stopped scanning.');
    };
    add(await container.getDescendants());
    for (const rem of [...candidates.values()]) {
      try {
        if (await rem.isTable()) {
          tableCount++;
          if (rem.type === RemType.PORTAL) {
            const members = await rem.getPortalDirectlyIncludedRem();
            add(members);
            for (const member of members) {
              add(await member.getDescendants());
              // Advanced-table column names can live under the row's table tag.
              // Read only its direct children; only our unique markers are writable.
              for (const tag of await member.getTagRems()) add([tag, ...await tag.getChildrenRem()]);
            }
          }
        }
      } catch (error) { errors.push(`Read table ${rem._id}: ${describe(error)}`); }
    }
    const marker = new RegExp(`${prefix}(\\d+)Z`, 'g');
    for (const rem of candidates.values()) {
      for (const field of ['text','backText'] as const) {
        const original = rem[field];
        const flat = textOf(original);
        if (!flat.includes(prefix)) continue;
        const next: RichTextInterface = [];
        const ids: number[] = [];
        let position = 0;
        for (const match of flat.matchAll(marker)) {
          const id = Number(match[1]);
          if (!values[id]) continue;
          if (match.index! > position) next.push(flat.slice(position, match.index));
          next.push(...values[id]); ids.push(id);
          position = match.index! + match[0].length;
        }
        if (!ids.length) continue;
        if (position < flat.length) next.push(flat.slice(position));
        try {
          // This is only an imported field containing this operation's random markers.
          // Refresh it first so a concurrent edit is never silently overwritten.
          const fresh = await plugin.rem.findOne(rem._id);
          if (!fresh || signature(fresh[field]) !== signature(original)) throw new Error('Imported cell changed before formatting; left it untouched.');
          if (field === 'text') await fresh.setText(next); else await fresh.setBackText(next);
          const checked = await plugin.rem.findOne(rem._id);
          if (!checked || signature(checked[field]) !== signature(next)) throw new Error('RemNote did not retain the expected cell text/color formatting.');
          ids.forEach(id => restored.add(id));
        } catch (error) { errors.push(`Cell Rem ${rem._id} (${field}): ${describe(error)}`); }
      }
    }
    if (restored.size !== values.length) errors.push(`Confirmed ${restored.size} of ${values.length} cell/text blocks. Some imported cells were not exposed by this RemNote client or could not be formatted.`);
    if (tableCount < table.tableCount) errors.push('RemNote did not confirm the imported table structure through its table API.');
    if (errors.length) throw new Error(errors.join('\n'));
    return `${table.cellCount} table cells pasted with formatting.`;
  } catch (error) {
    throw new Error(`Table paste could not be fully confirmed. Inspect “Pasted table” under the destination (Rem ${container._id}) before retrying; a partial import or temporary RRCP cell markers may remain. ${describe(error)}`);
  }
}
