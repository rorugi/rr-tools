// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ plugin: { widget: {
  getWidgetContext: vi.fn(async () => ({ contextData: { remIds: ['a', 'b'], jobId: 'job', readable: 2, accessErrors: [] as string[] } })), closePopup: vi.fn(async () => {}) },
  rem: { findOne: vi.fn() } } }));
vi.mock('@remnote/plugin-sdk', () => ({ AppEvents: { MessageBroadcast: 'message' }, renderWidget: vi.fn(), usePlugin: () => state.plugin, WidgetLocation: { Popup: 'Popup' } }));
vi.mock('../direction-service', async () => {
  const { changeDirections } = await import('../directions');
  return { requestDirectionChange: async (_plugin: unknown, _event: string, _job: string, from: 'forward', to: 'both') => changeDirections(state.plugin as never, ['a', 'b'], from, to) };
});
import { DirectionsPopup } from './directions';
let root: HTMLDivElement;
afterEach(() => { ReactDOM.unmountComponentAtNode(root); root.remove(); vi.clearAllMocks(); });
it('offers all three directions, blocks same-direction changes, and applies only once', async () => {
  root = document.createElement('div'); document.body.appendChild(root);
  let direction = 'forward';
  const setter = vi.fn(async (to: string) => { direction = to; });
  state.plugin.rem.findOne.mockImplementation(async () => ({ getCards: async () => [{}], getPracticeDirection: async () => direction, setPracticeDirection: setter }));
  await act(async () => { ReactDOM.render(<DirectionsPopup />, root); });
  const selects = root.querySelectorAll('select');
  for (const select of Array.from(selects)) expect(Array.from(select.options).map((o) => o.text)).toEqual(['Forward', 'Backward', 'Two-way']);
  const apply = root.querySelector('button')!;
  act(() => { selects[1].value = 'forward'; Simulate.change(selects[1]); });
  expect(apply.disabled).toBe(true);
  act(() => { selects[1].value = 'both'; Simulate.change(selects[1]); });
  await act(async () => { Simulate.click(apply); Simulate.click(apply); });
  expect(state.plugin.widget.closePopup).not.toHaveBeenCalled();
  expect(apply.type).toBe('button');
  expect(setter).toHaveBeenCalledTimes(1);
  expect(setter).toHaveBeenCalledWith('both');
  expect(root.querySelector('[role="status"]')?.textContent).toContain('1 changed');
  expect(root.textContent).not.toContain('Show last direction-change result');
  expect(root.querySelectorAll('button')).toHaveLength(1);
  expect(root.contains(apply)).toBe(false);
  expect(root.textContent).not.toContain('Finished');
  expect(root.querySelector('button')?.textContent).toBe('Close');
});
it('Cancel closes without changing cards', async () => {
  root = document.createElement('div'); document.body.appendChild(root);
  await act(async () => { ReactDOM.render(<DirectionsPopup />, root); });
  await act(async () => { Simulate.click(root.querySelectorAll('button')[1]); });
  expect(state.plugin.widget.closePopup).toHaveBeenCalledWith(true);
  expect(state.plugin.rem.findOne).not.toHaveBeenCalled();
});
it('shows the failing Rem, operation and actual error as safe text', async () => {
  root = document.createElement('div'); document.body.appendChild(root);
  state.plugin.rem.findOne.mockRejectedValue(new Error('<script>host failure</script>'));
  await act(async () => { ReactDOM.render(<DirectionsPopup />, root); });
  await act(async () => { Simulate.click(root.querySelector('button')!); });
  const details = root.querySelector('[aria-label="Failure details"]')!;
  expect(details.textContent).toContain('Rem a — Read Rem');
  expect(details.textContent).toContain('Rem b — Read Rem');
  expect(details.textContent).toContain('Error: <script>host failure</script>');
  expect(details.querySelector('script')).toBeNull();
  expect(root.textContent).not.toContain('limited to the focused subtree');
});
it('blocks submission when the main widget cannot read the selected Rems', async () => {
  root = document.createElement('div'); document.body.appendChild(root);
  state.plugin.widget.getWidgetContext.mockResolvedValueOnce({ contextData: { remIds: ['a', 'b'], jobId: 'job', readable: 0, accessErrors: ['a: no Rem', 'b: no Rem'] } });
  await act(async () => { ReactDOM.render(<DirectionsPopup />, root); });
  expect(root.querySelector('button')!.disabled).toBe(true);
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('before opening this popup');
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('ID: rr-tools');
});

