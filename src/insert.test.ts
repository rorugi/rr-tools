// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactRNPlugin } from '@remnote/plugin-sdk';
import { VERSION } from './version';
import { createPasteService, PASTE_REQUEST, PASTE_RESPONSE, requestPaste } from './insert';

function setup() {
  const plugin = {
    focus: { getFocusedRem: vi.fn(async (): Promise<{ _id: string } | undefined> => ({ _id: 'rem1' })) },
    window: { getFocusedPaneId: vi.fn(async () => 'pane1') },
    editor: { getSelection: vi.fn(async (): Promise<unknown> => undefined), getFocusedEditorText: vi.fn(async (): Promise<unknown> => ['original']), selectText: vi.fn(async () => {}), insertRichText: vi.fn(async () => {}) },
    widget: { openPopup: vi.fn(async (_name: string, _context: {jobId: string}, _outside: boolean) => {}), closePopup: vi.fn(async () => {}) },
    messaging: { broadcast: vi.fn(async (_message: unknown) => {}) },
    app: { toast: vi.fn(async () => {}) },
  };
  const service = createPasteService(plugin as unknown as ReactRNPlugin);
  const request = () => service.handle({ message: { type: PASTE_REQUEST, jobId: plugin.widget.openPopup.mock.calls[0][1].jobId, richText: [{ i: 'm', text: 'red', tc: 1 }] } });
  return { plugin, service, request };
}
afterEach(() => vi.useRealTimers());

it('captures the destination before opening; one request closes then inserts once in the index', async () => {
  const { plugin, service, request } = setup();
  await service.open();
  expect(plugin.widget.openPopup).toHaveBeenCalledWith('paste', {jobId: expect.any(String)}, false);
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  await Promise.all([request(), request()]); await request();
  expect(plugin.widget.closePopup).toHaveBeenCalledWith(true);
  expect(plugin.editor.insertRichText).toHaveBeenCalledExactlyOnceWith([{i:'m',text:'red',tc:1}]);
  expect(plugin.widget.closePopup.mock.invocationCallOrder[0]).toBeLessThan(plugin.editor.insertRichText.mock.invocationCallOrder[0]);
  expect(plugin.app.toast).toHaveBeenCalledWith('Text pasted. Use Undo to reverse it.');
});
it('rejects whole-Rem selection before opening', async () => {
  const {plugin,service} = setup(); plugin.editor.getSelection.mockResolvedValue({type:'Rem',remIds:['rem1']});
  await expect(service.open()).rejects.toThrow('Place the caret');
  expect(plugin.widget.openPopup).not.toHaveBeenCalled();
});
it('rejects navigation while capturing the destination', async () => {
  const {plugin,service} = setup();
  plugin.focus.getFocusedRem.mockResolvedValueOnce({_id:'rem1'}).mockResolvedValue({_id:'rem2'});
  await expect(service.open()).rejects.toThrow('destination changed');
  expect(plugin.widget.openPopup).not.toHaveBeenCalled();
});
it.each(['rem', 'pane', 'text', 'selection'])('does not write after a %s change', async kind => {
  const {plugin,service,request} = setup(); await service.open();
  if(kind==='rem') plugin.focus.getFocusedRem.mockResolvedValue({_id:'rem2'});
  if(kind==='pane') plugin.window.getFocusedPaneId.mockResolvedValue('pane2');
  if(kind==='text') plugin.editor.getFocusedEditorText.mockResolvedValue(['edited']);
  if(kind==='selection') plugin.editor.getSelection.mockResolvedValue({type:'Rem',remIds:['rem1']});
  await request();
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('Nothing was pasted'));
});
it('restores a captured text range before inserting', async () => {
  const {plugin,service,request}=setup();
  const selection={type:'Text',remId:'rem1',richText:['rig'],isReverse:false,range:{start:1,end:4}};
  plugin.editor.getSelection.mockResolvedValue(selection); await service.open();
  plugin.editor.getSelection.mockResolvedValue(undefined);
  plugin.editor.selectText.mockImplementation(async ()=>{plugin.editor.getSelection.mockResolvedValue(selection);});
  await request();
  expect(plugin.editor.selectText).toHaveBeenCalledWith({start:1,end:4});
  expect(plugin.editor.insertRichText).toHaveBeenCalledTimes(1);
});
it('waits for delayed focus restoration, without retrying an editor write', async () => {
  vi.useFakeTimers(); const {plugin,service,request}=setup(); await service.open();
  plugin.focus.getFocusedRem.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  const work=request(); await vi.runAllTimersAsync(); await work;
  expect(plugin.editor.insertRichText).toHaveBeenCalledTimes(1);
});
it('reports a focus-restoration timeout without writing', async () => {
  vi.useFakeTimers(); const {plugin,service,request}=setup(); await service.open();
  plugin.focus.getFocusedRem.mockResolvedValue(undefined);
  const work=request(); await vi.runAllTimersAsync(); await work;
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('did not restore'));
});
it('preserves the original editor error and never repeats a failed write', async () => {
  const {plugin,service,request}=setup(); await service.open();
  plugin.editor.insertRichText.mockRejectedValue(new Error('Host write failed 123'));
  await request(); await request();
  expect(plugin.editor.insertRichText).toHaveBeenCalledTimes(1);
  expect(plugin.app.toast).toHaveBeenCalledWith(expect.stringContaining('Host write failed 123'));
  expect(plugin.messaging.broadcast).toHaveBeenCalledWith(expect.objectContaining({type:PASTE_RESPONSE,error:expect.stringContaining('may already contain')}));
});
it('rejects stale popup requests without closing or writing', async () => {
  const {plugin,service,request}=setup(); await service.open(); service.clear(); await request();
  expect(plugin.widget.closePopup).not.toHaveBeenCalled(); expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  expect(plugin.messaging.broadcast).toHaveBeenCalledWith(expect.objectContaining({error:expect.stringContaining('expired')}));
});
it('cleans up its reply listener after timeout and ignores unrelated replies', async () => {
  vi.useFakeTimers(); let listener:(message:unknown)=>void=()=>{};
  const plugin={ event:{addListener:vi.fn((_a,_b,fn)=>{listener=fn;}),removeListener:vi.fn()}, messaging:{broadcast:vi.fn(async()=>{})} };
  const pending=requestPaste(plugin as unknown as ReactRNPlugin,'broadcast','job',['text']);
  const assertion=expect(pending).rejects.toThrow('No paste result');
  listener({message:{type:PASTE_RESPONSE,jobId:'other'}});
  await vi.runAllTimersAsync(); await assertion;
  expect(plugin.event.removeListener).toHaveBeenCalledTimes(1);
});

it('connects to the captured destination without requiring popup context or reading the current popup focus', async () => {
  const {plugin,service}=setup();await service.open();
  plugin.focus.getFocusedRem.mockClear();
  const message={message:{type:'rr-tools/paste/connect',connectionId:'client-1'}};
  await service.handle(message);await service.handle(message);
  expect(plugin.messaging.broadcast).toHaveBeenCalledWith({type:'rr-tools/paste/connected',connectionId:'client-1',jobId:plugin.widget.openPopup.mock.calls[0][1].jobId,supportsTables:true,supportsLines:true,target:'caret',destinationName:undefined,version:VERSION,error:undefined});
  expect(plugin.focus.getFocusedRem).not.toHaveBeenCalled();
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  await service.handle({message:{type:'rr-tools/paste/connect',connectionId:'another-popup'}});
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({error:expect.stringContaining('earlier popup'),jobId:undefined}));
});
it('never invents a destination when no command captured one', async () => {
  const {plugin,service}=setup();
  await service.handle({message:{type:'rr-tools/paste/connect',connectionId:'client-1'}});
  expect(plugin.messaging.broadcast).toHaveBeenCalledWith(expect.objectContaining({error:expect.stringContaining('No destination Rem was captured'),jobId:undefined}));
  expect(plugin.focus.getFocusedRem).not.toHaveBeenCalled();
});

function withRems(plugin: ReturnType<typeof setup>['plugin'], editorText: unknown[] = ['original']) {
  type R = { _id: string; parent: string | null; position?: number; text: unknown[]; backText?: unknown[]; direction?: string };
  const rems = new Map<string, R>();
  let next = 0;
  const make = (id: string, parent: string | null, text: unknown[] = []) => {
    const rem: R & Record<string, unknown> = { _id: id, parent, text,
      setText: async (value: unknown[]) => { rem.text = value; }, setBackText: async (value: unknown[]) => { rem.backText = value; },
      setPracticeDirection: async (value: string) => { rem.direction = value; },
      getFontSize: async () => undefined,
      setParent: async (value: string | null, position: number) => { rem.parent = value; rem.position = position; },
      positionAmongstSiblings: async () => 0, getChildrenRem: async () => [...rems.values()].filter(child => child.parent === id) };
    rems.set(id, rem); return rem;
  };
  make('doc', null, ['My doc']); make('rem1', 'doc', editorText);
  Object.assign(plugin, {
    rem: { findOne: vi.fn(async (id: string) => rems.get(id)), createRem: vi.fn(async () => make(`new${++next}`, null)) },
    richText: { toString: async (text: unknown[]) => text.map(p => typeof p === 'string' ? p : (p as { text?: string }).text ?? '').join('') },
  });
  Object.assign(plugin.window, { getOpenPaneRemId: vi.fn(async () => 'doc'), getLastFocusedPane: vi.fn(async () => 'pane1') });
  plugin.editor.getFocusedEditorText.mockResolvedValue(editorText);
  return rems;
}
const linesRequest = (plugin: ReturnType<typeof setup>['plugin'], service: ReturnType<typeof setup>['service']) => service.handle({ message: { type: PASTE_REQUEST,
  jobId: plugin.widget.openPopup.mock.calls[0][1].jobId, richText: ['x'],
  lines: [{ front: ['hund'], back: ['dog'], direction: 'forward', text: 'hund >> dog' }, { front: ['note'], text: 'note' }] } });

it('Multi-Paste captures the active document and appends lines at its end without the editor', async () => {
  const { plugin, service } = setup();
  const rems = withRems(plugin);
  await service.openDocument();
  await service.handle({ message: { type: 'rr-tools/paste/connect', connectionId: 'c' } });
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'document', destinationName: 'My doc', supportsLines: true }));
  plugin.focus.getFocusedRem.mockClear();
  await linesRequest(plugin, service);
  expect(plugin.focus.getFocusedRem).not.toHaveBeenCalled();
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  expect([rems.get('new1'), rems.get('new2')]).toMatchObject([
    { parent: 'doc', position: 1, text: ['hund'], backText: ['dog'], direction: 'forward' }, { parent: 'doc', position: 2, text: ['note'] }]);
  expect(plugin.app.toast).toHaveBeenLastCalledWith('Pasted 2 Rems (1 flashcard).');
  expect(plugin.messaging.broadcast).toHaveBeenLastCalledWith({ type: PASTE_RESPONSE, jobId: plugin.widget.openPopup.mock.calls[0][1].jobId, error: undefined });
});
it('Multi-Paste refuses a pane without a document', async () => {
  const { plugin, service } = setup();
  withRems(plugin);
  (plugin.window as unknown as { getOpenPaneRemId: ReturnType<typeof vi.fn> }).getOpenPaneRemId.mockResolvedValue(undefined);
  await expect(service.openDocument()).rejects.toThrow('not a Rem document');
  expect(plugin.widget.openPopup).not.toHaveBeenCalled();
});
it('pastes split lines below the caret Rem, filling it when it was empty', async () => {
  const { plugin, service } = setup();
  const rems = withRems(plugin, []);
  await service.open();
  await linesRequest(plugin, service);
  expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
  expect(rems.get('rem1')).toMatchObject({ text: ['hund'], backText: ['dog'] });
  expect(rems.get('new1')).toMatchObject({ parent: 'doc', position: 1, text: ['note'] });
});
it('keeps a non-empty caret Rem and adds every line after it', async () => {
  const { plugin, service } = setup();
  const rems = withRems(plugin, ['keep me']);
  await service.open();
  await linesRequest(plugin, service);
  expect(rems.get('rem1')!.text).toEqual(['keep me']);
  expect([rems.get('new1')!.text, rems.get('new2')!.text]).toEqual([['hund'], ['note']]);
});
