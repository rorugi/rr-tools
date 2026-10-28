// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ plugin: { widget: { closePopup: vi.fn() } }, connect: vi.fn(), start: vi.fn(), save: vi.fn(), cancel: vi.fn(), queue: vi.fn() }));
vi.mock('@remnote/plugin-sdk', () => ({ renderWidget: vi.fn(), usePlugin: () => state.plugin, Queue: (props: unknown) => { state.queue(props); return null; } }));
vi.mock('../practice', () => ({ connectPractice: state.connect, startPractice: state.start, savePractice: state.save }));
import { PracticeSelected } from './practice';
let root: HTMLDivElement;
const buttons = () => Array.from(root.querySelectorAll('button'));
const button = (name: string) => buttons().find(b => b.textContent === name)!;
beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement('div'); document.body.appendChild(root);
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 2, skipped: 0, cardIds: ['a-f', 'b-b'], remIds: ['a', 'b'], errors: [], jobId: 'job', schedule: { due: 1, fresh: 0, later: 1 } }), cancel: state.cancel });
  state.start.mockResolvedValue(undefined);
});
afterEach(() => { ReactDOM.unmountComponentAtNode(root); root.remove(); });
it('starts the native flashcard screen once for the captured job and never embeds a queue', async () => {
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(buttons().map(b => b.textContent)).toEqual(['Save as practice set…', 'Start practice', 'Other practice modes…', 'Close']);
  expect(root.textContent).toContain("RemNote's flashcard screen");
  expect(root.querySelector('[aria-label="Card schedule"]')!.textContent).toBe('1 due now · 0 new · 1 not due yet');
  expect(root.textContent).not.toContain('None of the selected cards is due');
  const start = button('Start practice');
  await act(async () => { Simulate.click(start); Simulate.click(start); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'queue');
  expect(state.queue).not.toHaveBeenCalled();
  expect(buttons().map(b => b.textContent)).toEqual(['Close']);
  await act(async () => { ReactDOM.unmountComponentAtNode(root); });
  expect(state.cancel).toHaveBeenCalledTimes(1);
});
it('says when nothing is due and points to Practice All', async () => {
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 1, skipped: 0, cardIds: ['a-f'], remIds: ['a'], errors: [], jobId: 'job', schedule: { due: 0, fresh: 0, later: 1 } }), cancel: state.cancel });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(root.textContent).toContain('0 due now · 0 new · 1 not due yet');
  expect(root.textContent).toContain('None of the selected cards is due');
});
it('offers the other native modes through the practice document', async () => {
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  expect(root.textContent).toContain('without recording answers');
  await act(async () => { Simulate.click(button('Other practice modes…')); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'modes');
  expect(state.queue).not.toHaveBeenCalled();
});
it('saves the selection as a named practice set and opens it', async () => {
  state.save.mockResolvedValue({ _id: 'set', name: 'Exam chapter 3', added: 2, already: 0 });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  act(() => { Simulate.click(button('Save as practice set…')); });
  const input = root.querySelector<HTMLInputElement>('input[aria-label="Practice set name"]')!;
  expect(input.value).toMatch(/^Practice set \d{4}-\d{2}-\d{2}$/);
  act(() => { Simulate.change(input, { target: { value: '' } as never }); });
  expect(button('Save').disabled).toBe(true);
  act(() => { Simulate.change(input, { target: { value: 'Exam chapter 3' } as never }); });
  await act(async () => { Simulate.click(button('Save')); Simulate.click(button('Save')); });
  expect(state.save).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', { name: 'Exam chapter 3' });
  expect(root.textContent).toContain('Saved “Exam chapter 3” in “RR Tools – Practice Sets”');
  await act(async () => { Simulate.click(button('Open practice set')); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'set');
});
it('keeps the name and shows save errors so the user can retry', async () => {
  state.save.mockRejectedValueOnce(new Error('RemNote did not create the practice set document.')).mockResolvedValueOnce({ _id: 'set', name: 'Retry', added: 1, already: 0 });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  act(() => { Simulate.click(button('Save as practice set…')); });
  await act(async () => { Simulate.click(button('Save')); });
  expect(root.querySelector('[role="alert"]')!.textContent).toContain('did not create');
  await act(async () => { Simulate.click(button('Save')); });
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain('Saved “Retry”');
});
it('offers Add to practice set only when sets exist, and adds to the chosen set', async () => {
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 2, skipped: 0, cardIds: ['a-f', 'b-b'], remIds: ['a', 'b'], errors: [], jobId: 'job',
    schedule: { due: 1, fresh: 0, later: 1 }, sets: [{ _id: 'exam', name: 'Exam' }, { _id: 'hard', name: 'Hard cards' }] }), cancel: state.cancel });
  state.save.mockResolvedValue({ _id: 'hard', name: 'Hard cards', added: 1, already: 1 });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  act(() => { Simulate.click(button('Add to practice set…')); });
  const select = root.querySelector<HTMLSelectElement>('select[aria-label="Practice set"]')!;
  expect(Array.from(select.options).map(o => o.text)).toEqual(['Exam', 'Hard cards']);
  expect(select.value).toBe('exam');
  act(() => { select.value = 'hard'; Simulate.change(select); });
  await act(async () => { Simulate.click(button('Add')); Simulate.click(button('Add')); });
  expect(state.save).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', { setId: 'hard' });
  expect(root.textContent).toContain('Added 1 Rem(s) to “Hard cards” (1 already in it).');
  await act(async () => { Simulate.click(button('Open practice set')); });
  expect(state.start).toHaveBeenCalledExactlyOnceWith(state.plugin, 'job', 'set');
});
it('says when every selected Rem is already in the set', async () => {
  state.connect.mockReturnValue({ result: Promise.resolve({ selected: 1, skipped: 0, cardIds: ['a-f'], remIds: ['a'], errors: [], jobId: 'job', sets: [{ _id: 'exam', name: 'Exam' }] }), cancel: state.cancel });
  state.save.mockResolvedValue({ _id: 'exam', name: 'Exam', added: 0, already: 1 });
  await act(async () => { ReactDOM.render(<PracticeSelected />, root); });
  act(() => { Simulate.click(button('Add to practice set…')); });
  await act(async () => { Simulate.click(button('Add')); });
  expect(root.textContent).toContain('All selected Rems are already in “Exam”.');
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
  expect(button('Practice available flashcards')).toBeTruthy();
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
