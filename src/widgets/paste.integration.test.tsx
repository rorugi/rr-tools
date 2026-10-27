// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { expect, it, vi } from 'vitest';
import type { ReactRNPlugin, RichTextInterface } from '@remnote/plugin-sdk';
import spanishHtml from '../../fixtures/word-spanish-colors.html?raw';
import { tableHost } from '../table-test-host';
import { createPasteService } from '../insert';
const state=vi.hoisted(()=>({component:undefined as React.ComponentType|undefined,plugin:undefined as unknown}));
vi.mock('@remnote/plugin-sdk',()=>({RemType:{PORTAL:6},AppEvents:{MessageBroadcast:'broadcast'},WidgetLocation:{Popup:'Popup'},renderWidget:(component:React.ComponentType)=>{state.component=component;},usePlugin:()=>state.plugin}));
import './paste';

it('missing host context still connects and inserts all five Spanish colored endings after the popup unmounts',async()=>{
  const listeners=new Set<(event:unknown)=>void>();
  let contextData={jobId:''};let focused=true;let lastRequest:unknown;
  const root=document.createElement('div');document.body.appendChild(root);
  const host=tableHost();
  const plugin={
    ...host.plugin,
    app:{toast:vi.fn(async()=>{})},
    event:{addListener:(_a:unknown,_b:unknown,listener:(event:unknown)=>void)=>listeners.add(listener),removeListener:(_a:unknown,_b:unknown,listener:(event:unknown)=>void)=>listeners.delete(listener)},
    messaging:{broadcast:async(message:unknown)=>{if((message as {type:string}).type==='rr-tools/paste/request')lastRequest=message;await Promise.all([...listeners].map(listener=>listener({message})));}},
    widget:{getWidgetContext:async()=>({widgetInstanceId:1}),openPopup:async(_name:string,context:{jobId:string})=>{contextData=context;focused=false;},closePopup:vi.fn(async()=>{ReactDOM.unmountComponentAtNode(root);focused=true;})},
    window:{getFocusedPaneId:async()=>'pane1'},
    focus:{getFocusedRem:async()=>focused?{_id:'test-rem'}:undefined},
    editor:{getSelection:async()=>undefined,getFocusedEditorText:async()=>focused?['']:undefined,insertRichText:vi.fn(async(_text:RichTextInterface)=>{})},
  };
  state.plugin=plugin;
  const service=createPasteService(plugin as unknown as ReactRNPlugin);
  listeners.add(event=>service.handle(event));
  try{
    await service.open();const Component=state.component!;
    await act(async()=>{ReactDOM.render(<Component/>,root);});
    act(()=>{Simulate.paste(root.querySelector('[role="textbox"]')!,{clipboardData:{getData:(type:string)=>type==='text/html'?spanishHtml:'hablaba'} as DataTransfer});});
    expect(root.querySelector('[role="status"]')?.textContent).toContain('5 colored text segments');
    expect(root.querySelectorAll('table tr')).toHaveLength(5);
    expect(root.querySelectorAll('table td')).toHaveLength(10);
    expect(root.querySelector('table td')?.textContent).toBe('hablaba');
    const button=Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='Paste')!;
    await act(async()=>{button.click();});
    expect(root.childElementCount).toBe(0);
    expect(plugin.widget.closePopup).toHaveBeenCalledWith(true);
    expect(plugin.editor.insertRichText).not.toHaveBeenCalled();
    await service.handle({message:lastRequest});
    expect(host.raw.richText.parseAndInsertHtml).toHaveBeenCalledTimes(1);
    expect(host.raw.rem.createRem).toHaveBeenCalledTimes(1);
    expect(host.cells.flatMap(cell=>cell.text).filter(r=>typeof r!=='string'&&'tc' in r)).toEqual([
      {i:'m',text:'aba',b:true,tc:6},{i:'m',text:'é',b:true,tc:4},{i:'m',text:'é',b:true,tc:3},
      {i:'m',text:'ía',b:true,tc:1},{i:'m',text:'a',b:true,tc:1},
    ]);
    expect(plugin.app.toast).toHaveBeenCalledWith('10 table cells pasted with formatting.');
  }finally{ReactDOM.unmountComponentAtNode(root);root.remove();}
});
