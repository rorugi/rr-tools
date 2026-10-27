import { MAX_INPUT } from './convert';
export type ClipboardPayload = { html: string; plain: string };
export async function readClipboard(clipboard: Pick<Clipboard, 'read'> | undefined): Promise<ClipboardPayload> {
  if (!clipboard?.read) throw new Error('Clipboard reading is unavailable. Click the paste box and press Ctrl+V (Mac: Cmd+V).');
  let items: ClipboardItems;
  try { items = await clipboard.read(); }
  catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`The browser or RemNote did not allow clipboard reading. Click the paste box and press Ctrl+V (Mac: Cmd+V). Browser details: ${detail}`);
  }
  // One logical item: do not combine HTML from one item with plain text from another.
  const item = items.find((i) => i.types.includes('text/html')) || items.find((i) => i.types.includes('text/plain'));
  if (!item) throw new Error('Clipboard has no text. Copy text from Word or a website first.');
  const get = async (type: string) => {
    if (!item.types.includes(type)) return '';
    const blob = await item.getType(type);
    if (blob.size > MAX_INPUT * 4) throw new Error('Clipboard is too large. Copy a smaller selection.');
    return blob.text();
  };
  return { html: await get('text/html'), plain: await get('text/plain') };
}
