import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { createDirectionService, requestDirectionChange, REQUEST, RESPONSE, LAST_RUN } from './direction-service';

function setup() {
  let direction = 'both';
  const setter = vi.fn(async (to: string) => { direction = to; });
  const rem = { getCards: async () => [{}], getPracticeDirection: async () => direction, setPracticeDirection: setter };
  const saved = new Map<string, unknown>();
  const plugin = { storage: { setLocal: vi.fn(async (key: string, value: unknown) => { saved.set(key, value); }), getLocal: vi.fn(async (key: string) => saved.get(key)) }, editor: { getSelectedRem: vi.fn(async () => ({ remIds: ['a'] })) },
    rem: { findOne: vi.fn(async () => rem as typeof rem | undefined) },
    widget: { openPopup: vi.fn(async () => {}) }, app: { toast: vi.fn(async (_message: string) => {}) },
    messaging: { broadcast: vi.fn(async (_message: unknown) => {}) } };
  return { plugin, setter, service: createDirectionService(plugin as unknown as ReactRNPlugin) };
}
it('checks access before the popup and executes the original selection in the index only once', async () => {
  const { plugin, setter, service } = setup();
  await service.open();
  const context = (plugin.widget.openPopup.mock.calls[0] as unknown as [string, { jobId: string; readable: number }])[1];
  expect(context.readable).toBe(1);
  plugin.editor.getSelectedRem.mockResolvedValue({ remIds: ['unselected'] });
  const request = { type: REQUEST, jobId: context.jobId, from: 'both' as const, to: 'forward' as const };
  await Promise.all([service.handle({ message: request }), service.handle({ message: request })]);
  expect(setter).toHaveBeenCalledTimes(1);
  expect(plugin.app.toast.mock.calls.filter((c) => String(c[0]).includes('1 changed'))).toHaveLength(1);
  expect(plugin.rem.findOne.mock.calls.every((call) => (call as unknown as string[])[0] === 'a')).toBe(true);
  expect(plugin.messaging.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: RESPONSE, result: expect.objectContaining({ changed: 1 }) }));
  await service.handle({ ...request, jobId: 'expired' });
  expect(setter).toHaveBeenCalledTimes(1);
});
it('distinguishes access denied before the popup without performing any writes', async () => {
  const { plugin, setter, service } = setup();
  plugin.rem.findOne.mockResolvedValue(undefined);
  await service.open();
  expect(plugin.widget.openPopup).toHaveBeenCalledWith('directions-dialog', expect.objectContaining({ readable: 0, accessErrors: [expect.stringContaining('before the popup')] }), false);
  expect(setter).not.toHaveBeenCalled();
});
it('client subscribes before sending and correlates only the requested job response', async () => {
  let listener: (m: unknown) => void = () => {};
  const result = { changed: 1, skipped: 0, failed: 0, errors: [] };
  const plugin = { event: { addListener: vi.fn((_event, _key, callback) => { listener = callback; }), removeListener: vi.fn() },
    messaging: { broadcast: vi.fn(async () => { listener({ message: { type: RESPONSE, jobId: 'other', result } }); listener({ message: { type: RESPONSE, jobId: 'job', result } }); }) } };
  await expect(requestDirectionChange(plugin as unknown as ReactRNPlugin, 'event', 'job', 'both', 'forward')).resolves.toEqual(result);
  expect(plugin.event.removeListener).toHaveBeenCalledTimes(1);
});

it('keeps a completion report and notifies even when the popup reply cannot be delivered', async () => {
  const { plugin, service } = setup();
  await service.open();
  const context = (plugin.widget.openPopup.mock.calls[0] as unknown as [string, { jobId: string }])[1];
  plugin.messaging.broadcast.mockRejectedValue(new Error('popup gone'));
  await expect(service.handle({ type: REQUEST, jobId: context.jobId, from: 'both', to: 'forward' })).rejects.toThrow('popup gone');
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('1 changed · 0 skipped · 0 failed'));
  expect(await plugin.storage.getLocal(LAST_RUN)).toMatchObject({ status: 'completed', result: { changed: 1 } });

});
it('reports zero matches and rejected stale requests explicitly', async () => {
  const { plugin, service } = setup();
  await service.open();
  const context = (plugin.widget.openPopup.mock.calls[0] as unknown as [string, { jobId: string }])[1];
  await service.handle({ type: REQUEST, jobId: context.jobId, from: 'backward', to: 'forward' });
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('0 changed · 1 skipped · 0 failed'));
  await service.handle({ type: REQUEST, jobId: 'missing', from: 'both', to: 'forward' });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.stringContaining('expired') }));
});
it('saves actual per-Rem failures and announces the failed count', async () => {
  const { plugin, service } = setup();
  await service.open();
  const context = (plugin.widget.openPopup.mock.calls[0] as unknown as [string, { jobId: string }])[1];
  plugin.rem.findOne.mockRejectedValue(new Error('host refused'));
  await service.handle({ type: REQUEST, jobId: context.jobId, from: 'both', to: 'forward' });
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('0 changed · 0 skipped · 1 failed'));
  expect(await plugin.storage.getLocal(LAST_RUN)).toMatchObject({ status: 'completed', result: { errors: [{ remId: 'a', message: expect.stringContaining('host refused') }] } });
});

it('delivers the saved result to the same popup if the completion broadcast is missed', async () => {
  vi.useFakeTimers();
  try {
    const result = { changed: 2, skipped: 1, failed: 0, errors: [] };
    const plugin = { event: { addListener: vi.fn(), removeListener: vi.fn() }, messaging: { broadcast: vi.fn(async () => {}) },
      storage: { getLocal: vi.fn().mockResolvedValueOnce({ jobId: 'old', status: 'completed', result }).mockResolvedValue({ jobId: 'job', status: 'completed', result }) } };
    const pending = requestDirectionChange(plugin as unknown as ReactRNPlugin, 'event', 'job', 'both', 'forward');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual(result);
    expect(plugin.storage.getLocal).toHaveBeenCalledTimes(2);
    expect(plugin.event.removeListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
