import { vi } from 'vitest';
import type { ReactRNPlugin, RichTextInterface } from '@remnote/plugin-sdk';

/** Simulated native table importer: deliberately drops all input formatting. */
export function tableHost(options: {portal?:boolean;dropCell?:boolean;stripColor?:boolean;failWrite?:boolean;flatten?:boolean;importError?:boolean}={}) {
  type Node = {type:number;_id:string;text:RichTextInterface;backText?:RichTextInterface;setText:ReturnType<typeof vi.fn>;setBackText:ReturnType<typeof vi.fn>;setParent:ReturnType<typeof vi.fn>;getDescendants:()=>Promise<Node[]>;isTable:()=>Promise<boolean>;isPortal:()=>Promise<boolean>;getTagRems:()=>Promise<Node[]>;getChildrenRem:()=>Promise<Node[]>;getPortalDirectlyIncludedRem:()=>Promise<Node[]>};
  const nodes=new Map<string,Node>();let serial=0;let tableNodes:Node[]=[];const cells:Node[]=[];
  const make=(id:string,kind='cell'):Node=>{
    const node:Node={type:options.portal?6:0,_id:id,text:[],
      setText:vi.fn(async(value:RichTextInterface)=>{if(options.failWrite&&kind==='cell')throw Error('cell write denied');node.text=options.stripColor?value.map(r=>typeof r==='string'?r:('text' in r?r.text:'')):value;}),
      setBackText:vi.fn(async(value:RichTextInterface)=>{node.backText=value;}),
      setParent:vi.fn(async()=>{}),
      getDescendants:async()=>kind==='container'?[...tableNodes,...(options.portal?[]:cells)]:[],
      isTable:async()=>kind==='table'&&!options.flatten,
      isPortal:async()=>!!options.portal, getTagRems:async()=>[],getChildrenRem:async()=>[],
      getPortalDirectlyIncludedRem:async()=>options.portal?cells:[],
    };nodes.set(id,node);return node;
  };
  const container=make('new-container','container');const existing=make('existing');existing.text=['Existing untouched text'];
  const plugin={rem:{createRem:vi.fn(async()=>container),findOne:vi.fn(async(id:string)=>nodes.get(id))},
    richText:{parseAndInsertHtml:vi.fn(async(html:string,_id:string)=>{
      const template=document.createElement('template');template.innerHTML=html;
      tableNodes=Array.from(template.content.querySelectorAll('table')).map(()=>make('table-'+serial++,'table'));
      for(const el of Array.from(template.content.querySelectorAll('td,th,p'))){
        if(options.dropCell&&cells.length===0){options.dropCell=false;continue;}
        const node=make('cell-'+serial++);node.text=[el.textContent||''];cells.push(node);
      }
      if(options.importError)throw Error('partial import error');
    })}};
  return {plugin:plugin as unknown as ReactRNPlugin,raw:plugin,container,cells,nodes,existing};
}
