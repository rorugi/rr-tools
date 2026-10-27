// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { createDirectionService } from '../direction-service';

const state = vi.hoisted(() => ({ plugin: undefined as unknown }));
vi.mock('@remnote/plugin-sdk', () => ({ AppEvents: { MessageBroadcast: 'message' }, renderWidget: vi.fn(), usePlugin: () => state.plugin, WidgetLocation: { Popup: 'Popup' } }));
import { DirectionsPopup } from './directions';
let root: HTMLDivElement;
afterEach(() => { if (root) { ReactDOM.unmountComponentAtNode(root); root.remove(); } });

async function setup(failure = false) {
  root = document.createElement('div'); document.body.appendChild(root);
  const subscribers = new Set<(event: unknown) => unknown>();
  const store = new Map<string, unknown>();
  let context: unknown;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let direction = 'forward';
  const setter = vi.fn(async (to: string) => {
    await gate;
    if (failure) throw new Error('Test host denied this write');
    direction = to;
  });
  const plugin = {
    editor: { getSelectedRem: async () => ({ remIds: ['card'] }) },
    rem: { findOne: async () => ({ getCards: async () => [{}], getPracticeDirection: async () => direction, setPracticeDirection: setter }) },
    app: { toast: vi.fn(async () => {}) },
    widget: {
      openPopup: vi.fn(async (_name: string, data: unknown, outside: boolean) => { expect(outside).toBe(false); context = data; }),
      getWidgetContext: async () => ({ contextData: context }),
      closePopup: vi.fn(async () => {}),
    },
    storage: { setLocal: async (key: string, value: unknown) => { store.set(key, value); }, getLocal: async (key: string) => store.get(key) },
    event: { addListener: (_event: string, _key: unknown, fn: (event: unknown) => unknown) => { subscribers.add(fn); }, removeListener: (_event: string, _key: unknown, fn: (event: unknown) => unknown) => { subscribers.delete(fn); } },
    // Matches installed RemNote dispatchEvent(MessageBroadcast, undefined, { message }).
    messaging: { broadcast: async (message: unknown) => { for (const fn of [...subscribers]) void fn({ message }); } },
  };
  state.plugin = plugin;
  const service = createDirectionService(plugin as unknown as ReactRNPlugin);
  subscribers.add(service.handle);
  await service.open();
  await act(async () => { ReactDOM.render(<DirectionsPopup />, root); });
  return { plugin, setter, release, subscribers };
}

it.each([false, true])('single click retains the same popup through delayed work and result (failure=%s)', async (failure) => {
  const { plugin, setter, release, subscribers } = await setup(failure);
  const popup = root.querySelector('main');
  const [apply, close] = Array.from(root.querySelectorAll('button'));
  await act(async () => { apply.click(); });
  expect(setter).toHaveBeenCalledTimes(1);
  expect(root.querySelector('[role="status"]')?.textContent).toContain('Changing flashcards');
  expect(close.disabled).toBe(true);
  expect(root.querySelectorAll('button')[0]).toBe(apply);
  expect(root.querySelectorAll('button')[1]).toBe(close);
  expect(plugin.widget.closePopup).not.toHaveBeenCalled();
  await act(async () => { release(); });
  expect(root.querySelector('main')).toBe(popup);
  expect(root.querySelector('[role="status"]')?.textContent).toContain(failure ? '0 changed · 0 skipped · 1 failed' : '1 changed · 0 skipped · 0 failed');
  if (failure) expect(root.textContent).toContain('Test host denied this write');
  expect(root.contains(apply)).toBe(false);
  expect(close.disabled).toBe(false);
  expect(subscribers.size).toBe(1); // Request listener removed after reply.
  await act(async () => { apply.click(); });
  expect(plugin.widget.closePopup).not.toHaveBeenCalled();
  expect(plugin.widget.openPopup).toHaveBeenCalledTimes(1);
  await act(async () => { close.click(); });
  expect(plugin.widget.closePopup).toHaveBeenCalledTimes(1);
});
