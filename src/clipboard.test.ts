import { expect, it, vi } from 'vitest';
import { readClipboard } from './clipboard';
const item = (data: Record<string, string>) => ({ types: Object.keys(data), presentationStyle: 'unspecified', getType: async (type: string) => new Blob([data[type]]) }) as ClipboardItem;
it('prefers the HTML item without mixing unrelated plain text', async () => {
  expect(await readClipboard({ read: async () => [item({ 'text/plain': 'wrong item' }), item({ 'text/html': '<b>x</b>', 'text/plain': 'x' })] })).toEqual({ html: '<b>x</b>', plain: 'x' });
});
it('supports a plain-only clipboard', async () => {
  expect(await readClipboard({ read: async () => [item({ 'text/plain': 'x' })] })).toEqual({ html: '', plain: 'x' });
});
it('reports denied access without a second automatic read', async () => {
  const read = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
  await expect(readClipboard({ read })).rejects.toThrow(/paste box.*Browser details: Error: NotAllowedError/);
  expect(read).toHaveBeenCalledTimes(1);
});
it('handles missing APIs and non-text data', async () => {
  await expect(readClipboard(undefined)).rejects.toThrow('paste box');
  await expect(readClipboard({ read: async () => [] })).rejects.toThrow('no text');
});
