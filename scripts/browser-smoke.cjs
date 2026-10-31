const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const native = process.env.RR_TEST_MODE === 'native';
const legacy = process.env.RR_LEGACY_HEIGHT === '1';
const widget = ['paste', 'practice-selected'].includes(process.env.RR_TEST_WIDGET) ? process.env.RR_TEST_WIDGET : 'directions-dialog';
const width = widget === 'paste' ? 620 : 560;
const tableFixture = process.env.RR_TABLE_FIXTURE === '1';
const linesFixture = process.env.RR_LINES_FIXTURE === '1';
const noPasteIndex = process.env.RR_NO_PASTE_INDEX === '1';
const { chromium } = require('playwright');
global.self = global;
const { AppEvents } = require('@remnote/plugin-sdk');
const watchdog=setTimeout(()=>{console.error('Browser test timed out');process.exit(1);},30000);
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.RR_BROWSER === 'bundled' ? undefined : process.env.RR_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
 try {
 const page = await browser.newPage({viewport:{width:1200,height:widget === 'paste' ? 600 : 900}});
 page.on('pageerror', e => console.log('ERROR',e.message));
 page.on('console', m => { console.log('CONSOLE',m.type(),m.text()); });
 await page.route('https://rr-tools.test/**', async route => {
  const url = new URL(route.request().url());
  if(url.pathname === '/host') return route.fulfill({contentType:'text/html',body:native ? `<!doctype html><body><div id="popup" style="width:${width}px;overflow:hidden"><div id="native-root"></div></div></body>` : `<!doctype html><body><iframe id="popup" style="border:0;width:${width}px;height:0px" src="/index.html?widgetName=${widget}"></iframe></body>`});
  const name = path.basename(url.pathname);
  if(name === 'App.css') return route.fulfill({contentType:'text/css',body:(process.env.RR_HOST_CSS ? fs.readFileSync(process.env.RR_HOST_CSS, 'utf8') : '') + '\n.rn-button::before{content:"";position:absolute;top:50%;left:0;width:100%;height:100%;transform:translateY(-50%)}'});
  const file = path.join('dist',name);
  return route.fulfill({status:fs.existsSync(file)?200:404, contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.json')?'application/json':'text/html',body:fs.existsSync(file)?fs.readFileSync(file):''});
 });
 await page.addInitScript(({AppEvents,native,legacy,width,widget,noPasteIndex}) => {
  if(window !== window.top) return;
  window.calls = []; window.popupClosed = false;
  window.addEventListener('message', e => {
   const data=e.data; if(!data?.isIntendedForRemNoteAPIMain) return;
   window.calls.push({method:data.methodName,args:data.args});
   let response;
   const sendEvent = (eventId,args) => { const event={isIntendedForRemNoteAPIPlugin:true,eventId,args}; if(native) window.testPlugin._receive({data:event}); else e.source.postMessage(event,'*'); };
   if(data.methodName==='askToActivate') sendEvent(AppEvents.onActivate,{inSandbox:!native,mountDiv:native?window.testMount:undefined,widgetOptions:{dimensions:{width,height:legacy?560:'auto'}},widgetInstanceId:1,rootURL:'https://rr-tools.test/',styleSheetHREFs:['https://rr-tools.test/App.css']});
   if(native && legacy && data.methodName==='activateCompleted') { window.testMount.style.position='absolute'; window.testMount.style.height='100%'; window.testMount.firstElementChild.style.height='560px'; }
   if(data.methodName==='widget.getWidgetContext') response=widget === 'paste' ? {widgetInstanceId:1} : {widgetInstanceId:1,contextData:{remIds:['test-card'],jobId:'test-job',readable:1,accessErrors:[]}};
   if(!native && data.methodName==='widgetEvents.updateWidgetContainerDimension') document.querySelector('iframe').style.height=data.args.height+'px';
   if(!noPasteIndex && data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/paste/connect') {
     sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/paste/connected',connectionId:data.args.message.connectionId,jobId:'test-job',supportsTables:true,supportsLines:true}});
   }
   if(data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/practice/connect') {
     sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/practice/connected',connectionId:data.args.message.connectionId,
       selection:{selected:2,skipped:0,cardIds:['selected-forward','selected-backward'],remIds:['selected-rem'],errors:[],jobId:'test-job',schedule:{due:1,fresh:0,later:1},sets:[{_id:'exam',name:'Exam chapter 2'}]}}});
   }
   if(data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/practice/save') {
     window.practiceSave=data.args.message;
     sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/practice/saved',jobId:'test-job',result:{_id:'set',name:data.args.message.name,added:1,already:0}}});
   }
   if(data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/practice/start') {
     window.practiceStart=data.args.message;
     // The actual index/navigation adapter is exercised by service/host-contract tests.
     sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/practice/started',jobId:'test-job'}});
   }
   if(data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/paste/request') {
     window.pastePayload=data.args.message.richText; window.pasteTable=data.args.message.table; window.pasteLines=data.args.message.lines;
     window.popupClosed=true; // Fake index handles the request; service integration test verifies real ordering.
     sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/paste/response',jobId:'test-job'}});
   }
   if(data.methodName==='messaging.broadcast' && data.args.message.type==='rr-tools/directions/request') setTimeout(()=>sendEvent(AppEvents.MessageBroadcast,{message:{type:'rr-tools/directions/response',jobId:'test-job',result:{changed:1,skipped:0,failed:0,errors:[]}}}),100);
   if(data.methodName==='widget.closePopup') window.popupClosed=true;
   const reply={isIntendedForRemNoteAPIPlugin:true,messageId:data.messageId,response}; if(native) window.testPlugin._receive({data:reply}); else e.source.postMessage(reply,'*');
  });
 },{AppEvents,native,legacy,width,widget,noPasteIndex});
 await page.goto('https://rr-tools.test/host');
 if(native) await page.evaluate(async ({widget,width}) => {

   window.nativePluginRenderers=new Map(); window.nativePluginDivs=new Map(); window.activeWidgetIds=new Set([1]); window.widgetIdToWidget={};
   const shadow=document.querySelector('#native-root').attachShadow({mode:'open'});
   const css=document.createElement('link');css.rel='stylesheet';css.href='/App.css';shadow.appendChild(css);
   window.testMount=document.createElement('div');window.testMount.style.width=width+'px';shadow.appendChild(window.testMount);
   await import('/'+widget+'.js?widgetName='+widget+'&pluginId=rr-tools');

   window.testPlugin=window.nativePluginRenderers.get('rr-tools.'+widget)(false);
 },{widget,width});
 const popup=native?page:page.frameLocator('#popup');
 try {
 if(widget === 'practice-selected') {
   const start=popup.getByRole('button',{name:'Start practice',exact:true});
   await start.waitFor({state:'visible'});
   assert.ok(await popup.getByRole('button',{name:'Other practice modes…',exact:true}).isVisible());
   assert.ok((await popup.locator('main').textContent()).includes("RemNote's flashcard screen"));
   assert.equal(await popup.getByRole('combobox').count(),0);
   assert.equal((await popup.getByLabel('Card schedule').textContent()).trim(),'1 due now · 0 new · 1 not due yet');
   const close=popup.getByRole('button',{name:'Close',exact:true});
   const box=await close.boundingBox();
   assert.ok(box.y+box.height<520,'Close remains within the bounded popup');
   await popup.getByRole('button',{name:'Add to practice set…',exact:true}).click();
   assert.equal(await popup.getByLabel('Practice set',{exact:true}).inputValue(),'exam');
   if(process.env.RR_ADD_SCREENSHOT) await page.screenshot({path:process.env.RR_ADD_SCREENSHOT});
   await popup.getByRole('button',{name:'Cancel',exact:true}).click();
   await popup.getByRole('button',{name:'Save as practice set…',exact:true}).click();
   const name=popup.getByLabel('Practice set name');
   await name.fill('Exam chapter 3');
   await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
   await name.press('Enter');
   await popup.getByText('Saved “Exam chapter 3” in “RR Tools – Practice Sets”',{exact:false}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.practiceSave),{type:'rr-tools/practice/save',jobId:'test-job',name:'Exam chapter 3'});
   assert.ok(await popup.getByRole('button',{name:'Open practice set',exact:true}).isVisible());
   await start.click();
   await page.waitForFunction(()=>!!window.practiceStart);
   assert.deepEqual(await page.evaluate(()=>window.practiceStart),{type:'rr-tools/practice/start',jobId:'test-job',target:'queue'});
   // Practice must never run inside the popup.
   assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='widgetEvents.createFakeEmbedComponent').length),0);
   assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='window.openWidgetInPane').length),0);
   await close.click();
   await page.waitForFunction(()=>window.popupClosed);
   console.log('PASS selected practice setup and launch request',native?'native':'sandbox');
   return;
 }
 if(widget === 'paste') {
   const input = popup.getByRole('textbox',{name:'Paste copied text here'});
   await input.waitFor({state:'visible'});
   assert.equal(await popup.getByRole('alert').count(),0,'An empty box must not cause a conversion error: '+await popup.getByRole('alert').allTextContents());
   if(noPasteIndex) await popup.getByRole('alert').filter({hasText:'disable and re-enable RR Tools'}).waitFor();
   if(linesFixture) {
     await popup.getByRole('checkbox',{name:'Split lines into separate Rems',exact:true}).check();
     const cards=popup.getByRole('checkbox',{name:'Create flashcards from >> << <>',exact:true});
     assert.equal(await cards.isEnabled(),true);
     await cards.check();
     const html='<p><span style="color:#c00000">el perro</span> &gt;&gt; the dog</p><p><span style="color:#0070c0">la casa</span> &lt;&gt; the house</p><p>los gatos &lt;&lt; the cats</p><p>Kapitel 3</p>';
     await input.evaluate((el,html)=>{const data=new DataTransfer();data.setData('text/html',html);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},html);
     await popup.getByRole('status').filter({hasText:'4 Rem(s) · 3 flashcard(s)'}).waitFor();
     assert.deepEqual(await input.locator('li').allTextContents(),['el perro → the dog','la casa ↔ the house','los gatos ← the cats','Kapitel 3']);
     await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
     await popup.getByRole('button',{name:'Paste',exact:true}).click();
     await page.waitForFunction(()=>!!window.pasteLines);
     assert.deepEqual(await page.evaluate(()=>window.pasteLines.map(l=>l.direction||null)),['forward','both','backward',null]);
     console.log('PASS line and flashcard paste',native?'native':'sandbox');
     return;
   }
   if(tableFixture) {
     const html=fs.readFileSync('fixtures/word-spanish-colors.html','utf8');
     await input.evaluate((el,html)=>{const data=new DataTransfer();data.setData('text/html',html);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},html);
     await popup.getByRole('status').filter({hasText:'10 cells'}).waitFor();
     assert.equal(await input.locator('table tr').count(),5);
     assert.equal(await input.locator('table td').count(),10);
     const headerRow=popup.getByRole('checkbox',{name:'Header Row',exact:true});
     const headerColumn=popup.getByRole('checkbox',{name:'Column Row',exact:true});
     assert.equal(await headerRow.isChecked(),false);assert.equal(await headerColumn.isChecked(),false);
     await headerRow.check();assert.equal(await input.locator('th[scope=col]').count(),2);
     await headerColumn.check();assert.equal(await input.locator('th').count(),6);
     assert.equal(await input.locator('span').filter({hasText:'aba'}).first().evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 255)');
     const paste=popup.getByRole('button',{name:'Paste',exact:true});
     const before=await paste.boundingBox();
     assert.ok(before.y+before.height<600,'Table Paste stays visible');
     await input.evaluate(el=>{el.scrollTop=el.scrollHeight;});
     assert.deepEqual(await paste.boundingBox(),before);
     await input.evaluate(el=>{el.scrollTop=0;});
     await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
     await paste.click();await page.waitForFunction(()=>window.popupClosed);
     assert.equal(await page.evaluate(()=>window.pasteTable.cellCount),10);
     assert.equal(await page.evaluate(()=>window.pasteTable.parts[0].rows.flat().filter(c=>c.header).length),6);
     assert.equal(await page.evaluate(()=>window.pasteTable.parts[0].rows[0][0].richText.some(r=>r.tc===6)),true);
     console.log('PASS table preview and structured request',native?'native':'sandbox');return;
   }
   await input.evaluate(el => {
     const data = new DataTransfer();
     data.setData('text/html', Array.from({length:800},(_,i)=>`<p><b>Row ${i} <span style="color:blue">colored ending</span></b></p>`).join(''));
     data.setData('text/plain','Long paste fixture');
     el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
   });
   await popup.getByRole('status').filter({hasText:'800 colored text segments'}).waitFor();
   if(noPasteIndex) {
     assert.ok(await popup.getByRole('button',{name:'Paste',exact:true}).isDisabled());
     assert.ok((await popup.getByRole('alert').textContent()).includes('disable and re-enable RR Tools'),'Pasting must not hide the setup failure');
     assert.equal(await page.evaluate(()=>window.popupClosed),false);
     await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
     console.log('PASS missing index: error persists after paste, no write');
     return;
   }
   const body=input;
   assert.ok((await input.textContent()).includes('Row 799'), 'Pasted text must be in the paste box itself');
   assert.equal(await input.locator('span').filter({hasText:'colored ending'}).first().evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 255)');
   assert.equal(await popup.getByRole('button').count(),2,'Only Paste and Cancel are needed');
   const prepare=popup.getByRole('button',{name:'Paste',exact:true});
   const footerBefore=await prepare.boundingBox();
   const box=await page.locator('#popup').boundingBox();
   assert.ok(box.height > 300 && box.height <= 500,'Long paste must not grow the host beyond the bounded dialog');
   assert.ok(footerBefore.y >= box.y && footerBefore.y+footerBefore.height <= box.y+box.height,'Paste must stay inside the visible popup');
   assert.ok(footerBefore.y+footerBefore.height < 600,'Paste must stay on screen');
   assert.equal(await body.evaluate(el=>el.scrollHeight>el.clientHeight),true,'Body must overflow and scroll');
   await body.hover(); await page.mouse.wheel(0,10000);
   assert.ok(await body.evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(el.scrollTop>0))))),'Mouse wheel scrolls the popup body');
   await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   assert.ok(await body.evaluate(el=>el.scrollTop>0),'Can reach the bottom of long pasted content');
   assert.deepEqual(await prepare.boundingBox(),footerBefore,'Footer must remain fixed while the body scrolls');
   await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
   await prepare.click();
   await page.waitForFunction(()=>window.popupClosed===true);
   assert.equal(await page.evaluate(()=>window.pastePayload.filter(r=>r.tc===6).length),800,'One Paste sends every colored segment');
   console.log('PASS long paste',native?'native':'sandbox',box);
   return;
 }
 if(legacy) {
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='activateCompleted'));
   const box=await page.locator('#popup').boundingBox();
   assert.equal(box.height,0,'Stale native fixed-height registration must reproduce the collapse');
   console.log('REPRODUCED stale native registration: zero-height popup');
   return;
 }
 await popup.getByRole('button',{name:'Change selected flashcards',exact:true}).waitFor({state:'visible',timeout:10000});
 console.log('BEFORE',await page.locator('#popup').boundingBox());
 // A real pointer click must reach Apply even with the host's absolute button hit layer.
 // DOM dispatch/React Simulate cannot catch a neighbouring Cancel layer intercepting it.
 await popup.getByRole('button',{name:'Change selected flashcards',exact:true}).click({timeout:5000});
 await popup.getByRole('status').filter({hasText:'1 changed'}).waitFor({timeout:5000});
 assert.equal(await popup.getByRole('button').count(),1,'Completed popup should offer only Close');
 assert.equal(await popup.getByText('Finished',{exact:true}).count(),0,'Finished is not an action');
 const box=await page.locator('#popup').boundingBox();
 assert.ok(box && box.height > 250, 'Popup must have a visible height');
 assert.equal(await page.evaluate(()=>window.popupClosed),false,'Result must not close popup');
 console.log('PASS',native?'native':'sandbox',box);
 await popup.getByRole('button',{name:'Close',exact:true}).click();
 await page.waitForFunction(()=>window.popupClosed===true);
 await page.screenshot({path:process.env.RR_SCREENSHOT || 'browser-test.png'});
 } catch(error) { console.log('CALLS',JSON.stringify(await page.evaluate(()=>window.calls))); throw error; }
 } finally {await browser.close();clearTimeout(watchdog);}
})().catch(e=>{console.error(e);process.exitCode=1});

