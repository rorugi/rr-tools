// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';

const lifecycle = vi.hoisted(() => ({ activate: undefined as ((plugin: ReactRNPlugin) => Promise<void>) | undefined }));
vi.mock('@remnote/plugin-sdk', async () => {
  const sdk = await vi.importActual<typeof import('@remnote/plugin-sdk')>('@remnote/plugin-sdk');
  return { ...sdk, declareIndexPlugin: (activate: typeof lifecycle.activate) => { lifecycle.activate = activate; } };
});
import { AppNamespace, RNPlugin } from '@remnote/plugin-sdk';
import './index';

afterEach(() => vi.restoreAllMocks());

function setup(menuError?: string) {
  type Message = { methodName: string; args: Record<string, unknown>; messageId: number };
  const messages: Message[] = [];
  const plugin = {
    id: 'rr-tools', widgetInstanceId: 1, usedMessageIds: 0, isNative: true,
    apiCallPromise: {} as Record<number, (result: unknown) => void>,
    logApi: vi.fn(), model: {} as Record<string, unknown>,
    event: { addListener: vi.fn(), removeListener: vi.fn() },
  } as unknown as ReactRNPlugin;
  // Execute the real SDK transport and AppNamespace, not a stub that merely
  // agrees with the caller's argument shape. This catches accidental prefixes.
  const call = (RNPlugin.prototype as unknown as { _call: (method: string, args: Record<string, unknown>, namespace?: string | string[]) => Promise<unknown> })._call.bind(plugin);
  Object.assign(plugin, { _call: call, app: new AppNamespace(call, plugin) });
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    const message = data as Message;
    messages.push(message);
    const valid = new Set(['registerCommand', 'registerMenuItem', 'registerWidget', 'registerRemMenuItem', 'toast']);
    const error = !valid.has(message.methodName) ? `Invalid endpoint "${message.methodName}"`
      : message.methodName === 'registerRemMenuItem' ? menuError || (!message.args.html ? 'html parameter: Required' : undefined)
      : undefined;
    const callbacks = (plugin as unknown as { apiCallPromise: Record<number, (value: unknown) => void> }).apiCallPromise;
    callbacks[message.messageId]({ response: undefined, error });
  });
  return { plugin, messages };
}

it('sends the unprefixed menu endpoint with html through the actual SDK transport', async () => {
  const { plugin, messages } = setup();
  await lifecycle.activate!(plugin);
  expect(messages.find(m => m.methodName === 'registerRemMenuItem')?.args).toEqual({
    id: 'change-selected-directions', html: 'RR Tools: Change selected flashcard directions',
  });
  expect(messages.some(m => m.methodName.startsWith('app.'))).toBe(false);
  expect(messages.filter(m => m.methodName === 'toast')).toEqual([]);
  expect(plugin.model['change-selected-directions']).toBeTypeOf('function');
  expect(messages.find(m => m.methodName === 'registerMenuItem')?.args).toMatchObject({ name: 'Select All Rem', location: 'DocumentMenu' });
  const commands = messages.filter(m => m.methodName === 'registerCommand').map(m => m.args.id);
  expect(commands).not.toContain('insert-prepared-colors');
  expect(commands).not.toContain('clear-prepared-colors');
  expect(commands).toEqual(expect.arrayContaining(['select-all-document-rems', 'paste-with-colors', 'practice-selected-flashcards']));
  expect(messages.find(m => m.methodName === 'registerRemMenuItem' && m.args.id === 'practice-selected-flashcards')?.args.html).toBe('Practice Selected Flashcards');
  expect(messages.find(m => m.methodName === 'registerMenuItem' && m.args.id === 'practice-selected-document-menu')?.args).toMatchObject({ name: 'Practice Selected Flashcards', location: 'DocumentMenu' });
  expect(messages.find(m => m.methodName === 'registerWidget' && m.args.fileName === 'practice-selected')?.args.location).toBe('Popup');
  const events = vi.mocked(plugin.event.addListener).mock.calls.map(call => call[0]);
  expect(events).toEqual(expect.arrayContaining(['queue.enter', 'queue.exit']));
});

it('finishes registering paste tools if the host rejects the optional Rem menu', async () => {
  const { plugin, messages } = setup('Menu unavailable in this host');
  await lifecycle.activate!(plugin);
  expect(messages.find(m => m.methodName === 'toast')?.args.message).toContain('Menu unavailable in this host');
  expect(messages.some(m => m.methodName === 'registerCommand' && m.args.id === 'paste-with-colors')).toBe(true);
});

