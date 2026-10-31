// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ component: undefined as React.ComponentType | undefined, listener: undefined as ((event:unknown)=>void) | undefined,
  plugin: { event:{addListener:vi.fn(),removeListener:vi.fn()}, messaging:{broadcast:vi.fn(async (_message:unknown)=>{})},
    widget:{getWidgetContext:vi.fn(async()=>({contextData:{jobId:'test-job'}})),closePopup:vi.fn(async()=>{})},
    storage:{getSynced:vi.fn(async(_key:string):Promise<unknown>=>undefined),setSynced:vi.fn(async(_key:string,_value:unknown)=>{})} } }));
vi.mock('@remnote/plugin-sdk', () => ({ RemType:{PORTAL:6},AppEvents:{MessageBroadcast:'broadcast'}, WidgetLocation:{Popup:'Popup'}, renderWidget:(component:React.ComponentType)=>{state.component=component;}, usePlugin:()=>state.plugin }));
import './paste';
let root:HTMLDivElement;
async function reply(value: unknown) {
  const message = value as { type: string; connectionId?: string };
  state.listener?.({message: message.type === 'rr-tools/paste/connect'
    ? {type:'rr-tools/paste/connected',connectionId:message.connectionId,jobId:'test-job'}
    : {type:'rr-tools/paste/response',jobId:'test-job'}});
}
const requests=()=>state.plugin.messaging.broadcast.mock.calls.filter(([message])=>(message as {type:string}).type==='rr-tools/paste/request');
beforeEach(()=>{
  state.plugin.event.addListener.mockImplementation((_a,_b,listener)=>{state.listener=listener;});
  state.plugin.messaging.broadcast.mockImplementation(reply);
  state.plugin.storage.getSynced.mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
});
afterEach(()=>{if(root){ReactDOM.unmountComponentAtNode(root);root.remove();}vi.clearAllMocks();vi.useRealTimers();});
async function mount(){root=document.createElement('div');document.body.appendChild(root);const Component=state.component!;await act(async()=>{ReactDOM.render(<Component/>,root);});}
const pasteButton=()=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='Paste')!;
const copy=()=>{act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?'<b style="color:red">hello</b>':'hello'} as DataTransfer});});};
it('shows colored text inside the paste box and a single Paste action submits it',async()=>{
  await mount();copy();
  const box=root.querySelector('[role="textbox"]')!;
  expect(box.textContent).toBe('hello');expect(box.querySelector('span')?.style.color).toBe('rgb(255, 0, 0)');
  expect(root.textContent).not.toContain('Prepare');expect(root.querySelector('[aria-label="Converted text preview"]')).toBeNull();
  await act(async()=>{Simulate.click(pasteButton());Simulate.click(pasteButton());});
  expect(requests()).toEqual([[{type:'rr-tools/paste/request',jobId:'test-job',richText:[{i:'m',text:'hello',b:true,tc:1}]}]]);
  expect(state.plugin.widget.closePopup).not.toHaveBeenCalled(); // index owns close and insertion
});
it('keeps Ctrl+V and Paste usable after a denied clipboard read and displays the actual error',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn().mockRejectedValue(new Error('denied'))}});
  await mount();await act(async()=>{Simulate.click(pasteButton());});
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('denied');expect(pasteButton().disabled).toBe(false);
  copy();await act(async()=>{Simulate.click(pasteButton());});expect(requests()).toHaveLength(1);
});
it('reads and sends text in one click when the clipboard is permitted and the box is empty',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn(async()=>[{types:['text/html'],getType:async()=>({size:32,text:async()=>'<b style="color:red">hello</b>'})}])}});
  await mount();await act(async()=>{Simulate.click(pasteButton());});
  expect(root.querySelector('[role="textbox"]')?.textContent).toBe('hello');
  expect(requests()).toHaveLength(1);
});
it('keeps service errors visible in the footer and prevents retrying an uncertain write',async()=>{
  state.plugin.messaging.broadcast.mockImplementation(async(message)=>{if((message as {type:string}).type==='rr-tools/paste/connect') return reply(message);state.listener?.({message:{type:'rr-tools/paste/response',jobId:'test-job',error:'Actual host failure'}});});
  await mount();copy();await act(async()=>{Simulate.click(pasteButton());});
  expect(root.querySelector('footer [role="alert"]')?.textContent).toBe('Actual host failure');expect(pasteButton().disabled).toBe(true);
});

it('loads the destination without widget context and shows no error for an empty box',async()=>{
  await mount();
  expect(state.plugin.widget.getWidgetContext).not.toHaveBeenCalled();
  expect(root.querySelector('[role="alert"]')).toBeNull();
  expect(pasteButton().disabled).toBe(false);
});
it('keeps the setup error visible when text arrives, instead of hiding why Paste is disabled',async()=>{
  vi.useFakeTimers();
  // Reproduce an older running index that never answers the new popup.
  state.plugin.messaging.broadcast.mockImplementation(async()=>{});
  await mount();
  expect(root.textContent).toContain('Connecting to the destination Rem');
  expect(root.querySelector('[role="alert"]')).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('disable and re-enable RR Tools');
  copy();
  expect(root.querySelector('[role="textbox"]')?.textContent).toBe('hello');
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('disable and re-enable RR Tools');
  expect(pasteButton().disabled).toBe(true);
  expect(requests()).toHaveLength(0);
});
it('enables Paste after a delayed connection without losing already pasted text',async()=>{
  let connectionId='';
  state.plugin.messaging.broadcast.mockImplementation(async(message)=>{connectionId=(message as {connectionId:string}).connectionId;});
  await mount();copy();expect(pasteButton().disabled).toBe(true);
  await act(async()=>{state.listener?.({message:{type:'rr-tools/paste/connected',connectionId,jobId:'test-job'}});});
  expect(pasteButton().disabled).toBe(false);
  expect(root.querySelector('[role="textbox"]')?.textContent).toBe('hello');
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

it('refuses to flatten a table through an old running index without table support',async()=>{
  await mount();
  act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?'<table><tr><td style="color:red">cell</td></tr></table>':'cell'} as DataTransfer});});
  expect(root.querySelectorAll('table td')).toHaveLength(1);
  expect(root.textContent).toContain('child under your destination Rem');
  await act(async()=>{Simulate.click(pasteButton());});
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('does not support tables yet');
  expect(requests()).toHaveLength(0);
});

it('shows header options only for tables, remembers them across pastes, and sends exactly the chosen headers',async()=>{
 state.plugin.messaging.broadcast.mockImplementation(async(message)=>{
  const m=message as {type:string;connectionId:string};
  if(m.type==='rr-tools/paste/connect')state.listener?.({message:{type:'rr-tools/paste/connected',connectionId:m.connectionId,jobId:'test-job',supportsTables:true}});
  else await reply(message);
 });
 await mount();expect(root.querySelectorAll('[aria-label="Table headers"] input')).toHaveLength(0);
 const pasteTable=()=>act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?'<table><tr><th style="color:red">A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table>':'A B C D'} as DataTransfer});});
 pasteTable();
 const checks=()=>Array.from(root.querySelectorAll<HTMLInputElement>('[aria-label="Table headers"] input'));
 expect(root.querySelector('[aria-label="Line options"]')).toBeNull();
 expect(checks().map(c=>c.checked)).toEqual([false,false]);expect(root.querySelectorAll('th')).toHaveLength(0);
 act(()=>{checks()[0].checked=true;Simulate.change(checks()[0]);});
 expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(2);
 act(()=>{checks()[1].checked=true;Simulate.change(checks()[1]);});
 expect(root.querySelectorAll('th')).toHaveLength(3);
 pasteTable();expect(checks().map(c=>c.checked)).toEqual([true,true]);
 act(()=>{checks()[0].checked=false;Simulate.change(checks()[0]);});
 await act(async()=>{Simulate.click(pasteButton());});
 const message=requests()[0][0] as {table:{parts:{rows:{header:boolean;headerScope?:string}[][]}[]}};
 expect(message.table.parts[0].rows.flat().map(c=>c.header)).toEqual([true,false,true,false]);
});
it('prefills a clipboard table for header selection without inserting',async()=>{
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn(async()=>[{types:['text/html'],getType:async()=>({size:50,text:async()=>'<table><tr><td>A</td></tr></table>'})}])}});
 await mount();
 expect(root.querySelectorAll('[aria-label="Table headers"] input')).toHaveLength(2);
 expect(requests()).toHaveLength(0);expect(pasteButton().disabled).toBe(false);
});

const connectWith=(extra:Record<string,unknown>)=>state.plugin.messaging.broadcast.mockImplementation(async(message)=>{
  const m=message as {type:string;connectionId:string};
  if(m.type==='rr-tools/paste/connect')state.listener?.({message:{type:'rr-tools/paste/connected',connectionId:m.connectionId,jobId:'test-job',supportsTables:true,supportsLines:true,...extra}});
  else await reply(message);
});
const copyText=(html:string,plain='')=>act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?html:plain} as DataTransfer});});
const lineOption=(i:number)=>root.querySelectorAll<HTMLInputElement>('[aria-label="Line options"] input')[i];
const toggle=(input:HTMLInputElement,value:boolean)=>act(()=>{input.checked=value;Simulate.change(input);});
it('restores the remembered options and saves every change',async()=>{
  state.plugin.storage.getSynced.mockResolvedValue({mode:'plain',splitLines:true,flashcards:true});
  await mount();
  expect(root.querySelector('select')!.value).toBe('plain');
  expect([lineOption(0).checked,lineOption(1).checked]).toEqual([true,true]);
  toggle(lineOption(1),false);
  expect(state.plugin.storage.setSynced).toHaveBeenLastCalledWith('pasteSettings',{mode:'plain',headerRow:false,headerColumn:false,splitLines:true,flashcards:false});
  toggle(lineOption(0),false);
  expect(lineOption(1).disabled).toBe(true);
});
it('previews lines and flashcards and sends them as lines',async()=>{
  connectWith({});
  await mount();
  toggle(lineOption(0),true);toggle(lineOption(1),true);
  copyText('<p><span style="color:red">perro</span> &gt;&gt; dog</p><p>gato &lt;&gt; cat</p><p>just a note</p>');
  const items=Array.from(root.querySelectorAll('[aria-label="Pasted lines"] li')).map(li=>li.textContent);
  expect(items).toEqual(['perro → dog','gato ↔ cat','just a note']);
  expect(root.textContent).toContain('3 Rem(s) · 2 flashcard(s)');
  await act(async()=>{Simulate.click(pasteButton());});
  const message=requests()[0][0] as {lines:{front:unknown[];back?:unknown[];direction?:string}[]};
  expect(message.lines.map(l=>[l.front,l.back,l.direction])).toEqual([
    [[{i:'m',text:'perro',tc:1}],['dog'],'forward'],[['gato'],['cat'],'both'],[['just a note'],undefined,undefined]]);
});
it('inserts a single plain line at the caret even with splitting on',async()=>{
  connectWith({});
  await mount();toggle(lineOption(0),true);
  copyText('<b>one line</b>');
  await act(async()=>{Simulate.click(pasteButton());});
  expect(requests()[0][0]).not.toHaveProperty('lines');
});
it('Multi-Paste names the document and always sends lines, even with splitting off',async()=>{
  connectWith({target:'document',destinationName:'Biology'});
  await mount();
  expect(root.querySelector('h2')!.textContent).toBe('Multi-Paste');
  copyText('<p>a</p><p>b</p>');
  expect(root.textContent).toContain('new Rem at the end of “Biology”');
  await act(async()=>{Simulate.click(pasteButton());});
  const message=requests()[0][0] as {lines:{text:string}[]};
  expect(message.lines.map(l=>l.text)).toEqual(['a\nb']);
});
it('prefills the box from the clipboard but never overwrites text the user pasted',async()=>{
  let resolveRead:(value:unknown)=>void=()=>{};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn(()=>new Promise(resolve=>{resolveRead=resolve;}))}});
  await mount();
  copyText('<b>mine</b>');
  await act(async()=>{resolveRead([{types:['text/plain'],getType:async()=>({size:5,text:async()=>'clipboard'})}]);});
  expect(root.querySelector('[role="textbox"]')!.textContent).toBe('mine');
});
it('falls back to plain clipboard text when rich reading is not allowed',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn().mockRejectedValue(new Error('denied')),readText:vi.fn(async()=>'plain words')}});
  await mount();
  expect(root.querySelector('[role="textbox"]')!.textContent).toBe('plain words');
  expect(root.querySelector('[role="alert"]')).toBeNull();
});
