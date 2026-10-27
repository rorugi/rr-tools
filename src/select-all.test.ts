import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { makeSelectAll } from './select-all';

function setup() {
  const document = {
    getDescendants: vi.fn(async () => [{ _id: 'a' }, { _id: 'nested-b' }, { _id: 'a' }, { _id: 'doc' }]),
    expand: vi.fn(async () => {}),
  };
  const plugin = {
    window: { getFocusedPaneId: vi.fn(async () => 'pane'), getLastFocusedPane: vi.fn(async () => 'pane'), getOpenPaneRemId: vi.fn(async (): Promise<string | undefined> => 'doc') },
    rem: { findOne: vi.fn(async () => document) },
    editor: { selectRem: vi.fn(async () => {}), getSelectedRem: vi.fn(async () => ({ remIds: ['a', 'nested-b'] })) },
    app: { toast: vi.fn(async () => {}) },
  };
  return { plugin, document, run: makeSelectAll(plugin as unknown as ReactRNPlugin) };
}
it('selects all unique descendants of the active document, excluding the title', async () => {
  const { plugin, document, run } = setup();
  await run();
  expect(plugin.rem.findOne).toHaveBeenCalledWith('doc');
  expect(document.expand).toHaveBeenCalledWith('doc', true);
  expect(plugin.editor.selectRem).toHaveBeenCalledWith(['a', 'nested-b'], 'doc');
  expect(plugin.app.toast).toHaveBeenCalledWith('Selected all 2 Rems in this document.');
});
it('does not select anything when navigation changes during collection', async () => {
  const { plugin, document, run } = setup();
  plugin.window.getOpenPaneRemId.mockResolvedValueOnce('doc').mockResolvedValue('other-doc');
  await run();
  expect(document.expand).not.toHaveBeenCalled();
  expect(plugin.editor.selectRem).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('document changed'));
});
it('reports an empty document without disturbing selection', async () => {
  const { plugin, document, run } = setup();
  document.getDescendants.mockResolvedValue([]);
  await run();
  expect(plugin.editor.selectRem).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('no Rems'));
});
it('reports partial host selection instead of claiming all were selected', async () => {
  const { plugin, run } = setup();
  plugin.editor.getSelectedRem.mockResolvedValue({ remIds: ['a'] });
  await run();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('confirmed 1 of 2'));
});
it('reports the actual API error and prevents concurrent batches', async () => {
  const { plugin, document, run } = setup();
  document.getDescendants.mockRejectedValue(new Error('Host read denied'));
  await Promise.all([run(), run()]);
  expect(document.getDescendants).toHaveBeenCalledTimes(1);
  expect(plugin.editor.selectRem).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('Host read denied'));
});
it('does not use a widget or search pane as a document', async () => {
  const { plugin, run } = setup();
  plugin.window.getOpenPaneRemId.mockResolvedValue(undefined);
  await run();
  expect(plugin.rem.findOne).not.toHaveBeenCalled();
  expect(plugin.editor.selectRem).not.toHaveBeenCalled();
});
