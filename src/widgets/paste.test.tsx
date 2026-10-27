// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ component: undefined as React.ComponentType | undefined, listener: undefined as ((event:unknown)=>void) | undefined,
  plugin: { event:{addListener:vi.fn(),removeListener:vi.fn()}, messaging:{broadcast:vi.fn(async (_message:unknown)=>{})},
    widget:{getWidgetContext:vi.fn(async()=>({contextData:{jobId:'test-job'}})),closePopup:vi.fn(async()=>{})} } }));
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

it('shows unchecked header options only for tables and sends exactly the chosen headers',async()=>{
 state.plugin.messaging.broadcast.mockImplementation(async(message)=>{
  const m=message as {type:string;connectionId:string};
  if(m.type==='rr-tools/paste/connect')state.listener?.({message:{type:'rr-tools/paste/connected',connectionId:m.connectionId,jobId:'test-job',supportsTables:true}});
  else await reply(message);
 });
 await mount();expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
 const pasteTable=()=>act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?'<table><tr><th style="color:red">A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table>':'A B C D'} as DataTransfer});});
 pasteTable();
 const checks=()=>Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
 expect(checks().map(c=>c.checked)).toEqual([false,false]);expect(root.querySelectorAll('th')).toHaveLength(0);
 act(()=>{checks()[0].checked=true;Simulate.change(checks()[0]);});
 expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(2);
 act(()=>{checks()[1].checked=true;Simulate.change(checks()[1]);});
 expect(root.querySelectorAll('th')).toHaveLength(3);
 pasteTable();expect(checks().map(c=>c.checked)).toEqual([false,false]);
 act(()=>{checks()[1].checked=true;Simulate.change(checks()[1]);});
 await act(async()=>{Simulate.click(pasteButton());});
 const message=requests()[0][0] as {table:{parts:{rows:{header:boolean;headerScope?:string}[][]}[]}};
 expect(message.table.parts[0].rows.flat().map(c=>c.header)).toEqual([true,false,true,false]);
});
it('loads directly read tables for header selection before inserting',async()=>{
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:vi.fn(async()=>[{types:['text/html'],getType:async()=>({size:50,text:async()=>'<table><tr><td>A</td></tr></table>'})}])}});
 await mount();await act(async()=>{Simulate.click(pasteButton());});
 expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
 expect(requests()).toHaveLength(0);expect(pasteButton().disabled).toBe(false);
});
