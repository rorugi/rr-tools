// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ plugin: { widget: { closePopup: vi.fn() } }, connect: vi.fn(), start: vi.fn(), cancel: vi.fn(), queue: vi.fn() }));
vi.mock('@remnote/plugin-sdk', () => ({ renderWidget: vi.fn(), usePlugin: () => state.plugin, Queue: (props: unknown) => { state.queue(props); return null; } }));
vi.mock('../practice', () => ({ connectPractice: state.connect, startPractice: state.start }));
import { PracticeSelected } from './practice';
let root: HTMLDivElement;
const buttons = () => Array.from(root.querySelectorAll('button'));
const button = (name: string) => buttons().find(b => b.textContent === name)!;
beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement('div'); document.body.appendChild(root);
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 2, skipped: 0, cardIds: ['a-f', 'b-b'], remIds: ['a', 'b'], errors: [], jobId: 'job' }), cancel: state.cancel });
  state.start.mockResolvedValue(undefined);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(root); root.remove(); });
it('starts the native flashcard screen once for the captured job and never embeds a queue', async () => {
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(buttons().map(b => b.textContent)).toEqual(['Start practice', 'Other practice modes…', 'Close']);
  expect(root.textContent).toContain("RemNote's flashcard screen");
  const start = button('Start practice');
  await act(async () => { Simulate.click(start); Simulate.click(start); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'queue');
  expect(state.queue).not.toHaveBeenCalled();
  expect(buttons().map(b => b.textContent)).toEqual(['Close']);
  await act(async () => { ReactDOM.unmountComponentAtNode(root); });
  expect(state.cancel).toHaveBeenCalledTimes(1);
});
it('offers the other native modes through the practice document', async () => {
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(root.textContent).toContain('without recording answers');
  await act(async () => { Simulate.click(button('Other practice modes…')); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'modes');
  expect(state.queue).not.toHaveBeenCalled();
});
it('blocks empty selections and keeps Close available', async () => {
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 2, skipped: 2, cardIds: [], remIds: [], errors: [], jobId: 'job' }), cancel: state.cancel });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(root.textContent).toContain('No enabled flashcards');
  expect(button('Start practice').disabled).toBe(true);
  expect(button('Other practice modes…').disabled).toBe(true);
  expect(button('Close').disabled).toBe(false);
  expect(state.start).not.toHaveBeenCalled();
});
it('shows partial errors as text and requires an explicit start', async () => {
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 2, skipped: 0, cardIds: ['a-f'], remIds: ['a'], errors: ['Rem b: <script>denied</script>'], jobId: 'job' }), cancel: state.cancel });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('Rem b: <script>denied</script>');
  expect(root.querySelector('script')).toBeNull();
  expect(buttons()[0].textContent).toBe('Practice available flashcards');
  expect(state.start).not.toHaveBeenCalled();
});
it('keeps launch errors visible without closing the popup', async () => {
  state.start.mockRejectedValueOnce(new Error('The knowledge base changed'));
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  await act(async () => { Simulate.click(button('Start practice')); });
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('The knowledge base changed');
  expect(state.plugin.widget.closePopup).not.toHaveBeenCalled();
  await act(async () => { Simulate.click(button('Close')); });
  expect(state.plugin.widget.closePopup).toHaveBeenCalledWith(false);
});
