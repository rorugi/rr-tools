import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { changeDirections, errorMessage, openDirections, selectedIds, type Direction } from './directions';

function card(initial: Direction | 'none', count = 1) {
  let direction = initial;
  return { getCards: vi.fn(async () => Array(count).fill({})), getPracticeDirection: vi.fn(async () => direction),
    setPracticeDirection: vi.fn(async (to: Direction) => { direction = to; }) };
}
function setup(rems: Record<string, ReturnType<typeof card>>) {
  const findOne = vi.fn(async (id: string) => rems[id]);
  return { findOne, plugin: { rem: { findOne } } as unknown as ReactRNPlugin };
}
for (const from of ['forward', 'backward', 'both'] as Direction[]) {
  for (const to of ['forward', 'backward', 'both'] as Direction[]) {
    if (from === to) continue;
    it(`changes ${from} to ${to}, leaving nonmatching directions untouched`, async () => {
      const matching = card(from), other = card(to), unselected = card(from);
      const { plugin, findOne } = setup({ matching, other, unselected });
      expect(await changeDirections(plugin, ['matching', 'other'], from, to)).toMatchObject({ changed: 1, skipped: 1, failed: 0 });
      expect(matching.setPracticeDirection).toHaveBeenCalledWith(to);
      expect(other.setPracticeDirection).not.toHaveBeenCalled();
      expect(unselected.setPracticeDirection).not.toHaveBeenCalled();
      expect(findOne.mock.calls.map(([id]) => id)).toEqual(['matching', 'other']);
    });
  }
}
it('skips plain notes and none directions; deduplicates selected IDs', async () => {
  const plain = card('forward', 0), disabled = card('none'), rem = card('forward');
  const { plugin } = setup({ plain, disabled, rem });
  expect(await changeDirections(plugin, ['plain', 'disabled', 'rem', 'rem'], 'forward', 'both')).toMatchObject({ changed: 1, skipped: 2, failed: 0 });
  expect(plain.setPracticeDirection).not.toHaveBeenCalled();
  expect(rem.setPracticeDirection).toHaveBeenCalledTimes(1);
});
it('continues after missing, rejected and silently denied writes', async () => {
  const rejected = card('forward'), silent = card('forward'), good = card('forward');
  rejected.setPracticeDirection.mockRejectedValue(new Error('denied'));
  silent.setPracticeDirection.mockImplementation(async () => {});
  const { plugin } = setup({ rejected, silent, good });
  const result = await changeDirections(plugin, ['missing', 'rejected', 'silent', 'good'], 'forward', 'backward');
  expect(result).toMatchObject({ changed: 1, skipped: 0, failed: 3 });
  expect(result.errors).toEqual([
    { remId: 'missing', stage: 'Read Rem', message: expect.stringContaining('returned no Rem') },
    { remId: 'rejected', stage: 'Change direction', message: 'Error: denied' },
    { remId: 'silent', stage: 'Verify direction', message: expect.stringContaining('expected "backward" and received "forward"') },
  ]);
});
it('preserves structured SDK errors and distinguishes a verification exception from a write failure', async () => {
  const readError = card('forward'), verifyError = card('forward');
  readError.getCards.mockRejectedValue({ code: 'ACCESS_DENIED', message: 'Read forbidden' });
  verifyError.getPracticeDirection.mockResolvedValueOnce('forward').mockRejectedValueOnce(new Error('Timed out'));
  const { plugin } = setup({ readError, verifyError });
  const result = await changeDirections(plugin, ['readError', 'verifyError'], 'forward', 'both');
  expect(result.errors[0]).toEqual({ remId: 'readError', stage: 'Read flashcards', message: '{"code":"ACCESS_DENIED","message":"Read forbidden"}' });
  expect(result.errors[1]).toMatchObject({ remId: 'verifyError', stage: 'Verify direction', message: expect.stringContaining('Error: Timed out') });
  expect(result.errors[1].message).toContain('may already have been saved');
  expect(verifyError.setPracticeDirection).toHaveBeenCalledTimes(1);
});
it('formats thrown strings and empty errors without inventing a cause', () => {
  expect(errorMessage('Host disconnected')).toBe('Host disconnected');
  expect(errorMessage(undefined)).toContain('No error details');
  const circular: Record<string, unknown> = {}; circular.self = circular;
  expect(errorMessage(circular)).toContain('could not be serialized');
});
it('rejects identical and invalid directions without writes', async () => {
  const { plugin, findOne } = setup({});
  await expect(changeDirections(plugin, ['x'], 'both', 'both')).rejects.toThrow('different');
  await expect(changeDirections(plugin, ['x'], 'invalid' as Direction, 'both')).rejects.toThrow('valid');
  expect(findOne).not.toHaveBeenCalled();
});
it('captures the selection in popup context and rejects empty selections', async () => {
  const selection = { remIds: ['a', 'b', 'a'] };
  const plugin = { editor: { getSelectedRem: vi.fn(async () => selection) },
    widget: { openPopup: vi.fn(async () => {}) }, app: { toast: vi.fn(async () => {}) } };
  await openDirections(plugin as unknown as ReactRNPlugin);
  selection.remIds = ['changed-after-open'];
  expect(plugin.widget.openPopup).toHaveBeenCalledWith('directions-dialog', { remIds: ['a', 'b'] }, false);
  selection.remIds = [];
  await openDirections(plugin as unknown as ReactRNPlugin);
  expect(plugin.widget.openPopup).toHaveBeenCalledTimes(1);
  expect(plugin.app.toast).toHaveBeenCalledTimes(1);
  expect(selectedIds([null, 'a'])).toEqual([]);
});

