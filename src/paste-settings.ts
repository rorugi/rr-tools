import type { ColorMode } from './convert';

/** Paste options remembered between pastes (synced plugin storage, so they follow the user across devices). */
export type PasteSettings = { mode: ColorMode; headerRow: boolean; headerColumn: boolean; splitLines: boolean; flashcards: boolean };
export const PASTE_SETTINGS_KEY = 'pasteSettings';
export const DEFAULT_PASTE_SETTINGS: PasteSettings = { mode: 'palette', headerRow: false, headerColumn: false, splitLines: false, flashcards: false };

/** Accepts only known values, so an older or damaged record falls back to the defaults field by field. */
export function readPasteSettings(value: unknown): PasteSettings {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const flag = (key: keyof PasteSettings) => typeof stored[key] === 'boolean' ? stored[key] as boolean : DEFAULT_PASTE_SETTINGS[key] as boolean;
  return {
    mode: stored.mode === 'palette' || stored.mode === 'exact' || stored.mode === 'plain' ? stored.mode : DEFAULT_PASTE_SETTINGS.mode,
    headerRow: flag('headerRow'), headerColumn: flag('headerColumn'), splitLines: flag('splitLines'), flashcards: flag('flashcards'),
  };
}
