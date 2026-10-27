export const DIRECTIONS_WIDGET = 'directions-dialog';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';

export type Direction = 'forward' | 'backward' | 'both';
export const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'forward', label: 'Forward' },
  { value: 'backward', label: 'Backward' },
  { value: 'both', label: 'Two-way' },
];
export function selectedIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0)) return [];
  return [...new Set(value)];
}
export type DirectionFailure = { remId: string; stage: string; message: string };
export type DirectionResult = { changed: number; skipped: number; failed: number; errors: DirectionFailure[] };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error) || 'No error details were supplied by RemNote.'; }
  catch { return 'RemNote returned an error that could not be serialized.'; }
}

/** Work only on the selection captured before the popup stole editor focus. */
export async function changeDirections(plugin: Pick<ReactRNPlugin, 'rem'>, ids: string[], from: Direction, to: Direction): Promise<DirectionResult> {
  if (!DIRECTIONS.some((d) => d.value === from) || !DIRECTIONS.some((d) => d.value === to)) throw new Error('Choose valid directions.');
  if (from === to) throw new Error('Choose a different destination direction.');
  const result: DirectionResult = { changed: 0, skipped: 0, failed: 0, errors: [] };
  for (const id of selectedIds(ids)) {
    let stage = 'Read Rem';
    const fail = (message: string) => {
      result.failed++;
      result.errors.push({ remId: id, stage, message });
    };
    try {
      const rem = await plugin.rem.findOne(id);
      if (!rem) { fail('RemNote returned no Rem for this ID. It may be missing or inaccessible; the API supplied no further details.'); continue; }
      // Plain notes must not be turned into cards. No descendants are traversed.
      stage = 'Read flashcards';
      if ((await rem.getCards()).length === 0) { result.skipped++; continue; }
      stage = 'Read current direction';
      if (await rem.getPracticeDirection() !== from) {
        result.skipped++; continue;
      }
      stage = 'Change direction';
      await rem.setPracticeDirection(to);
      // Permission-denied host operations may return silently; verify the resulting state.
      stage = 'Verify direction';
      const actual = await rem.getPracticeDirection();
      if (actual === to) result.changed++;
      else fail(`Update returned without an error, but verification expected "${to}" and received "${actual}". Inspect the Rem before retrying.`);
    } catch (error) {
      fail(errorMessage(error) + (stage === 'Verify direction' ? ' The update may already have been saved; verification failed. Inspect the Rem before retrying.' : ''));
    }
  }
  return result;
}

export async function openDirections(plugin: ReactRNPlugin) {
  const selection = await plugin.editor.getSelectedRem();
  const remIds = selectedIds(selection?.remIds);
  if (!remIds.length) {
    await plugin.app.toast('Select Rems first, then run “RR Tools: Change selected flashcard directions”.');
    return;
  }
  await plugin.widget.openPopup(DIRECTIONS_WIDGET, { remIds }, false);
}
