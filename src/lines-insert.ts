import type { PluginRem, ReactRNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import type { PasteLine } from './lines';

/** after: new siblings directly below the Rem (reusing it when it is empty). end: new children at the end of a document. */
export type LineDestination = { kind: 'after' | 'end'; remId: string; reuseEmpty?: boolean };
export type LinesResult = { rems: number; cards: number; reused: boolean };

type Host = Pick<ReactRNPlugin, 'rem' | 'richText'>;
const plain = async (plugin: Host, text: RichTextInterface | undefined) => (await plugin.richText.toString(text ?? [])).trim();

/**
 * Creates one Rem per pasted line, in order. Flashcard lines get their back text and practice direction, which is
 * what RemNote itself stores for >>, << and <>. Every Rem is read back; RR Tools has no delete permission, so a
 * failure reports how far the paste got instead of rolling back.
 */
export async function insertLines(plugin: Host, destination: LineDestination, lines: PasteLine[]): Promise<LinesResult> {
  if (!lines.length) throw new Error('There is no text to paste.');
  const anchor = await plugin.rem.findOne(destination.remId);
  if (!anchor) throw new Error('The destination Rem no longer exists. Nothing was pasted.');
  let parent: string | null;
  let position: number;
  let reuse: PluginRem | undefined;
  if (destination.kind === 'end') {
    parent = anchor._id;
    position = (await anchor.getChildrenRem()).length;
  } else {
    parent = anchor.parent;
    const index = await anchor.positionAmongstSiblings();
    if (index === undefined) throw new Error('RemNote did not report where the destination Rem is. Nothing was pasted.');
    position = index + 1;
    // Fill an empty bullet instead of leaving it above the pasted lines.
    if (destination.reuseEmpty && !await plain(plugin, anchor.text) && !await plain(plugin, anchor.backText)) reuse = anchor;
  }
  const written: string[] = [];
  const failed = (n: number, reason: string) => new Error(`${reason} Pasted ${n - 1} of ${lines.length} lines; check line ${n} (“${lines[n - 1].text.slice(0, 60)}”) and the lines after it.`);
  for (const [i, line] of lines.entries()) {
    let rem = i === 0 ? reuse : undefined;
    if (!rem) {
      rem = await plugin.rem.createRem();
      if (!rem?._id) throw failed(i + 1, 'RemNote did not create a Rem.');
      await rem.setParent(parent, position++);
    }
    await rem.setText(line.front);
    if (line.heading) await rem.setFontSize(`H${line.heading}`);
    if (line.back) {
      await rem.setBackText(line.back);
      await rem.setPracticeDirection(line.direction ?? 'forward');
    }
    written.push(rem._id);
  }
  for (const [i, id] of written.entries()) {
    const line = lines[i];
    const saved = await plugin.rem.findOne(id);
    const ok = saved && await plain(plugin, saved.text) === await plain(plugin, line.front)
      && (!line.back || await plain(plugin, saved.backText) === await plain(plugin, line.back));
    if (!ok) throw failed(i + 1, 'RemNote did not save a pasted line.');
  }
  return { rems: written.length, cards: lines.filter(line => line.back || line.clozes).length, reused: !!reuse };
}

export function describeLines(result: LinesResult) {
  const cards = result.cards ? ` (${result.cards} flashcard${result.cards === 1 ? '' : 's'})` : '';
  return `Pasted ${result.rems} Rem${result.rems === 1 ? '' : 's'}${cards}.`;
}
