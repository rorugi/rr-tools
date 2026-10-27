// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { convertPaste } from './convert-table';
import spanishHtml from '../fixtures/word-spanish-colors.html?raw';

it('keeps the Spanish Word table as five rows, two cells per row and five colored endings',()=>{
  const result=convertPaste(spanishHtml,'ignored','palette');
  expect(result.table?.cellCount).toBe(10);
  expect(result.table?.tableCount).toBe(1);
  const table=result.table!.parts.find(p=>p.kind==='table')!;
  if(table.kind!=='table') throw Error('No table');
  expect(table.rows.map(r=>r.length)).toEqual([2,2,2,2,2]);
  expect(table.rows[0][0].text).toBe('hablaba');
  expect(table.rows[0][0].richText).toContainEqual({i:'m',text:'aba',b:true,tc:6});
  expect(result.coloredRuns).toBe(5);
  expect(result.warnings.some(w=>w.includes('flattened'))).toBe(false);
});
it('preserves inherited cell colors, merged spans, empty cells, repeated text and surrounding paragraphs',()=>{
  const result=convertPaste('<div style="color:red"><p>Before</p><table><tr><th colspan="2">Title</th></tr><tr><td rowspan="2">same</td><td>same</td></tr><tr><td></td></tr></table><p>After</p></div>','','exact');
  const parts=result.table!.parts;
  expect(parts.map(p=>p.kind)).toEqual(['text','table','text']);
  const table=parts[1];if(table.kind!=='table')throw Error('No table');
  expect(table.rows[0][0]).toMatchObject({header:false,colSpan:2});
  expect(table.rows[1][0]).toMatchObject({rowSpan:2});
  expect(table.rows[1][1].richText).toContainEqual({i:'m',text:'same',tc:'#ff0000'});
  expect(table.rows[2][0].richText).toEqual([]);
});
it('plain mode keeps table structure but removes formats',()=>{
  const result=convertPaste('<table><tr><td><b style="color:blue">Hi</b></td></tr></table>','','plain');
  const table=result.table!.parts[0];if(table.kind!=='table')throw Error('No table');
  expect(table.rows[0][0].richText).toEqual(['Hi']);
});
it('rejects nested and oversized tables instead of silently losing structure',()=>{
  expect(()=>convertPaste('<table><tr><td><table><tr><td>X</td></tr></table></td></tr></table>','','palette')).toThrow('Nested');
  expect(()=>convertPaste('<table><tr>'+ '<td>x</td>'.repeat(501)+'</tr></table>','','palette')).toThrow('500 cells');
});
it('keeps scripts, hidden tables and unsafe links out of the table payload',()=>{
  const result=convertPaste('<script>alert(1)</script><table hidden><tr><td>secret</td></tr></table><table onclick="bad()"><tr><td><img src="https://example.test/x"><a href="javascript:bad()" style="color:red">visible</a></td></tr></table>','','palette');
  expect(result.table?.cellCount).toBe(1);
  expect(JSON.stringify(result.table)).not.toMatch(/secret|javascript|onclick|example.test|alert/);
});
it('does not invent a table for empty or normal text',()=>{
  expect(convertPaste('','','palette')).toEqual({text:'',richText:[],coloredRuns:0,warnings:[]});
  expect(convertPaste('<b>hello</b>','hello','palette').table).toBeUndefined();
});

it.each([[false,false,0],[true,false,2],[false,true,2],[true,true,3]] as const)('sets row=%s column=%s headers independently', (headerRow,headerColumn,count)=>{
 const result=convertPaste('<table><tr><th style="color:red">A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table>','','palette',{headerRow,headerColumn});
 const part=result.table!.parts[0];if(part.kind!=='table')throw Error('No table');
 expect(part.rows.flat().filter(c=>c.header)).toHaveLength(count);
 expect(part.rows[0][0].richText).toContainEqual({i:'m',text:'A',tc:1});
 expect(part.rows[0][1].headerScope).toBe(headerRow?'col':undefined);
 expect(part.rows[1][0].headerScope).toBe(headerColumn?'row':undefined);
});
it('handles the first grid column when a previous row spans into it, and resets for each table',()=>{
 const result=convertPaste('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr><tr><td>D</td><td>E</td></tr></table><table><tr><td>F</td><td>G</td></tr></table>','','palette',{headerRow:false,headerColumn:true});
 const tables=result.table!.parts.filter(p=>p.kind==='table');
 expect(tables.flatMap(p=>p.rows.flat().filter(c=>c.header).map(c=>c.text))).toEqual(['A','D','F']);
});
