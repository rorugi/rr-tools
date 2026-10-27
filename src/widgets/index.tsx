import { AppEvents, declareIndexPlugin, PluginCommandMenuLocation, WidgetLocation, type ReactRNPlugin } from '@remnote/plugin-sdk';
import { createPasteService } from '../insert';
import { DIRECTIONS_WIDGET } from '../directions';
import { createDirectionService } from '../direction-service';
import { makeSelectAll } from '../select-all';
import { createPracticeService, PRACTICE_WIDGET } from '../practice';
import { createPracticeCleanup } from '../native-practice';
let cleanupDirections: (() => void) | undefined;
let cleanupPaste: (() => void) | undefined;
let cleanupPractice: (() => void) | undefined;

async function onActivate(plugin: ReactRNPlugin) {
  const selectAll = makeSelectAll(plugin);
  await plugin.app.registerCommand({ id: 'select-all-document-rems', name: 'RR Tool Select All', action: selectAll });
  try {
    await plugin.app.registerMenuItem({ id: 'select-all-document-menu', name: 'Select All Rem', location: PluginCommandMenuLocation.DocumentMenu, action: selectAll });
  } catch (e) {
    await plugin.app.toast(`Select All Rem menu unavailable: ${String(e)}. Use “RR Tool Select All” from the command menu.`);
  }
  await plugin.app.registerWidget(DIRECTIONS_WIDGET, WidgetLocation.Popup, { dimensions: { width: 560, height: 'auto' } });
  const service = createDirectionService(plugin);
  const listener = (message: Parameters<typeof service.handle>[0]) => { void service.handle(message).catch((e) => plugin.app.toast(String(e))); };
  plugin.event.addListener(AppEvents.MessageBroadcast, undefined, listener);
  cleanupDirections = () => { plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, listener); service.clear(); };
  const directionCommand = { id: 'change-selected-directions', name: 'RR Tools: Change selected flashcard directions', action: () => service.open().catch((e) => plugin.app.toast(String(e))) };
  await plugin.app.registerCommand(directionCommand);
  // SDK 0.0.46's wrapper drops `html`, but the current host requires it.
  // AppNamespace uses the legacy, unprefixed endpoint despite its class name.
  // registerCommand above already installs the action under this callback ID.
  const host = plugin as unknown as { _call(method: string, args: Record<string, unknown>): Promise<unknown> };
  try {
    await host._call('registerRemMenuItem', { id: directionCommand.id, html: directionCommand.name });
  } catch (error) {
    await plugin.app.toast(`RR Tools context menu unavailable: ${String(error)}. Use the command menu.`);
  }
  await plugin.app.registerWidget('paste', WidgetLocation.Popup, { dimensions: { width: 620, height: 'auto' } });
  const paste = createPasteService(plugin);
  const pasteListener = (event: unknown) => { void paste.handle(event).catch(e => plugin.app.toast(String(e))); };
  plugin.event.addListener(AppEvents.MessageBroadcast, undefined, pasteListener);
  cleanupPaste = () => { plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, pasteListener); paste.clear(); };
  await plugin.app.registerCommand({ id: 'paste-with-colors', name: 'RR Tools: Paste with colors…', action: () => paste.open().catch(e => plugin.app.toast(String(e))) });
  await plugin.app.registerWidget(PRACTICE_WIDGET, WidgetLocation.Popup, { dimensions: { height: 'auto', width: 560 } });
  const practiceCleanup = createPracticeCleanup(plugin, e => plugin.app.toast(`Practice Selected Flashcards: could not clear the practice list: ${String(e)}`));
  const practice = createPracticeService(plugin, practiceCleanup);
  const practiceListener = (event: unknown) => { void practice.handle(event).catch(e => plugin.app.toast(String(e))); };
  plugin.event.addListener(AppEvents.MessageBroadcast, undefined, practiceListener);
  // Remove the references (RemNote's "1" reference count) once the practice session is over.
  plugin.event.addListener(AppEvents.QueueEnter, undefined, practiceCleanup.queueEntered);
  plugin.event.addListener(AppEvents.QueueExit, undefined, practiceCleanup.queueExited);
  cleanupPractice = () => {
    plugin.event.removeListener(AppEvents.MessageBroadcast, undefined, practiceListener);
    plugin.event.removeListener(AppEvents.QueueEnter, undefined, practiceCleanup.queueEntered);
    plugin.event.removeListener(AppEvents.QueueExit, undefined, practiceCleanup.queueExited);
    practiceCleanup.cancel(); practice.clear();
  };
  // Leftovers from a session that was interrupted (e.g. RemNote closed mid-practice).
  void (async () => {
    if (!await plugin.window.isOnPage('Queue' as Parameters<typeof plugin.window.isOnPage>[0])) await practiceCleanup.clearNow();
  })().catch(() => {});
  const practiceCommand = { id: 'practice-selected-flashcards', name: 'Practice Selected Flashcards', action: () => practice.open().catch(e => plugin.app.toast(String(e))) };
  await plugin.app.registerCommand(practiceCommand);
  await plugin.app.registerMenuItem({ id: 'practice-selected-document-menu', name: practiceCommand.name,
    location: PluginCommandMenuLocation.DocumentMenu, action: practiceCommand.action });
  try {
    await host._call('registerRemMenuItem', { id: practiceCommand.id, html: practiceCommand.name });
  } catch (error) {
    await plugin.app.toast(`Practice Selected Flashcards context menu unavailable: ${String(error)}. Use the command menu.`);
  }
}
async function onDeactivate() { cleanupDirections?.(); cleanupPaste?.(); cleanupPractice?.(); }
declareIndexPlugin(onActivate, onDeactivate);
