// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { convertPaste } from './convert-table';
import { insertColoredTable } from './table-insert';
import { tableHost } from './table-test-host';
const sample=()=>convertPaste('<table><tr><td style="color:red">same</td><td style="color:blue">same</td><td></td></tr></table>','','palette').table!;
it.each([false,true])('writes colors explicitly after a formatting-stripping import (portal=%s)',async portal=>{
  const host=tableHost({portal});
  expect(await insertColoredTable(host.plugin,'destination',sample())).toContain('3 table cells');
  expect(host.container.setParent).toHaveBeenCalledWith('destination');
  expect(host.cells[0].text).toContainEqual({i:'m',text:'same',tc:1});
  expect(host.cells[1].text).toContainEqual({i:'m',text:'same',tc:6});
  expect(host.cells[2].text).toEqual([]);
  expect(host.existing.setText).not.toHaveBeenCalled();
  expect(JSON.stringify(host.cells.map(c=>c.text))).not.toContain('RRCP');
  expect(host.raw.richText.parseAndInsertHtml).toHaveBeenCalledTimes(1);
});
it('reports missing cells with partial-import location, without guessing from equal text',async()=>{
  const host=tableHost({dropCell:true});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('Confirmed 2 of 3');
  expect(host.existing.setText).not.toHaveBeenCalled();
});
it('does not report success if the host drops colors on the explicit write',async()=>{
  const host=tableHost({stripColor:true});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('did not retain');
});
it('reports the actual cell-write error and never retries it',async()=>{
  const host=tableHost({failWrite:true});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('cell write denied');
  expect(host.cells.every(cell=>cell.setText.mock.calls.length===1)).toBe(true);
});
it('restores recoverable cells after a partially failed import, but retains the import error',async()=>{
  const host=tableHost({importError:true});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('partial import error');
  expect(JSON.stringify(host.cells.map(c=>c.text))).not.toContain('RRCP');
});
it('reports unconfirmed table structure even if cell colors were written',async()=>{
  const host=tableHost({flatten:true});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('table structure');
});

it('does not overwrite a concurrent edit to a newly imported cell',async()=>{
  const host=tableHost();
  host.raw.rem.findOne.mockImplementationOnce(async(id)=>{const rem=host.nodes.get(id)!;rem.text=['User edit'];return rem;});
  await expect(insertColoredTable(host.plugin,'destination',sample())).rejects.toThrow('changed before formatting');
  expect(host.cells[0].text).toEqual(['User edit']);
  expect(host.cells[0].setText).not.toHaveBeenCalled();
});

it.each([[false,false,0],[true,false,2],[false,true,2],[true,true,3]] as const)('exports header row=%s column=%s to the native importer',async(headerRow,headerColumn,count)=>{
 const host=tableHost();
 const table=convertPaste('<table><tr><th style="color:red">A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table>','','palette',{headerRow,headerColumn}).table!;
 await insertColoredTable(host.plugin,'destination',table);
 const dom=document.createElement('template');dom.innerHTML=host.raw.richText.parseAndInsertHtml.mock.calls[0][0];
 expect(dom.content.querySelectorAll('th')).toHaveLength(count);
 expect(dom.content.querySelectorAll('th[scope="col"]')).toHaveLength(headerRow?2:0);
 expect(dom.content.querySelectorAll('th[scope="row"]')).toHaveLength(headerColumn?(headerRow?1:2):0);
 expect(host.cells[0].text).toContainEqual({i:'m',text:'A',tc:1});
});
