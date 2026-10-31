// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { colorValue, convertClipboard, MAX_INPUT } from './convert';
import spanishHtml from '../fixtures/word-spanish-colors.html?raw';

it('preserves the five colored Spanish endings and flattened two-column Word rows', () => {
  const html = spanishHtml;
  const result = convertClipboard(html, '', 'palette');
  expect(result.text.trim()).toBe('hablaba\tImperfecto – blau\nhablé\tIndefinido – grün\nhablaré\tFuturo – ocker\nhablaría\tCondicional – rot\n¡habla!\tImperativo – rot');
  const colored = result.richText.filter((r) => typeof r !== 'string' && 'tc' in r && r.tc !== undefined);
  expect(colored).toEqual([
    { i: 'm', text: 'aba', b: true, tc: 6 },
    { i: 'm', text: 'é', b: true, tc: 4 },
    { i: 'm', text: 'é', b: true, tc: 3 },
    { i: 'm', text: 'ía', b: true, tc: 1 },
    { i: 'm', text: 'a', b: true, tc: 1 },
  ]);
  const exact = convertClipboard(html, '', 'exact');
  expect(exact.richText.flatMap((r) => typeof r !== 'string' && 'tc' in r && r.tc !== undefined ? [r.tc] : []))
    .toEqual(['#2176cd', '#3b9f46', '#ae9000', '#c00000', '#c00000']);
});

describe('colors and Word-like HTML', () => {
  it('retains nested inline foreground colors in exact payloads', () => {
    const r = convertClipboard('<p style="color:red">red <b style="color:#123abc">custom</b> red</p>', '', 'exact');
    expect(r.text).toBe('red custom red');
    expect(r.richText).toEqual([{ i: 'm', text: 'red ', tc: '#ff0000' }, { i: 'm', text: 'custom', b: true, tc: '#123abc' }, { i: 'm', text: ' red', tc: '#ff0000' }]);
  });
  it('supports Word spans, font color, and Office comments', () => {
    const r = convertClipboard('<!--StartFragment--><p class="MsoNormal"><span style="color:rgb(255, 0, 0);mso-bidi-font-weight:bold">Word</span> <font color="blue">web</font></p><!--EndFragment-->', '', 'exact');
    expect(r.text).toBe('Word web');
    expect(r.coloredRuns).toBe(2);
  });
  it('normalizes CSS colors', () => {
    for (const c of ['red', '#f00', 'rgb(255,0,0)', 'hsl(0,100%,50%)']) expect(colorValue(c, 'exact')).toBe('#ff0000');
    expect(colorValue('rebeccapurple', 'exact')).toBe('#663399');
  });
  it('maps native palette IDs and treats default white/black as uncolored', () => {
    expect(colorValue('#ff0000', 'palette')).toBe(1);
    expect(colorValue('blue', 'palette')).toBe(6);
    expect(colorValue('black', 'palette')).toBeUndefined();
    expect(colorValue('white', 'palette')).toBeUndefined();
  });
  it('rejects unresolved and translucent colors', () => {
    for (const c of ['var(--theme)', 'transparent', 'rgba(255,0,0,.5)', 'url(https://evil.test)']) expect(colorValue(c, 'exact')).toBeUndefined();
  });
  it('resets inherited color for explicit black in palette mode', () => {
    const r = convertClipboard('<span style="color:red">a<span style="color:black">b</span>c</span>', '', 'palette');
    expect(r.richText[1]).not.toHaveProperty('tc');
    expect(r.richText[2]).toHaveProperty('tc', 1);
  });
});

describe('text, formatting and safety', () => {
  it('keeps paragraphs and breaks without doubled nested block separators', () => {
    expect(convertClipboard('<div><p>one<br>two</p><p>three</p></div>', '').text).toBe('one\ntwo\nthree');
  });
  it('collapses HTML whitespace across spans, preserves NBSP and pre text', () => {
    expect(convertClipboard('<span>a </span> <span> b&nbsp;c</span>', '').text).toBe('a b\u00a0c');
    expect(convertClipboard('<pre>a\n  b</pre>', '').text).toBe('a\n  b');
  });
  it('keeps bold/italic/underline/code and only safe links', () => {
    const r = convertClipboard('<b><i><u><code>x</code></u></i></b><a href="https://example.com">ok</a><a href="javascript:alert(1)">no</a>', '');
    expect(r.richText[0]).toMatchObject({ b: true, l: true, u: true, code: true });
    expect(r.richText[1]).toHaveProperty('url', 'https://example.com');
    expect(r.richText[2]).not.toHaveProperty('url');
  });
  it('omits executable/hidden/media content without mounting it', () => {
    const r = convertClipboard('<script>window.pwned=1</script><img src="https://evil.test/x"><iframe src="https://evil.test"></iframe><style>body{color:red}</style><span hidden>secret</span><span onclick="alert(1)">safe</span>', '');
    expect(r.text).toBe('safe');
    expect(document.querySelector('img, iframe, script')).toBeNull();
  });
  it('falls back to plain text only when no HTML text can be extracted', () => {
    expect(convertClipboard('<img>', 'alternative').richText).toEqual(['alternative']);
    expect(convertClipboard('', '<literal> & text').richText).toEqual(['<literal> & text']);
  });
  it('plain mode strips all formatting and can extract HTML-only text', () => {
    expect(convertClipboard('<b style="color:red">x</b>', '', 'plain').richText).toEqual(['x']);
  });
  it('rejects oversized and deeply nested inputs', () => {
    expect(() => convertClipboard('', 'x'.repeat(MAX_INPUT + 1))).toThrow('too large');
    expect(() => convertClipboard('<div>'.repeat(110) + 'x' + '</div>'.repeat(110), '')).toThrow('too complex');
  });
});

it.each(['palette', 'exact', 'plain'] as const)('treats empty %s input as an empty box, without recursion or warnings', mode => {
  expect(convertClipboard('', '', mode)).toEqual({text:'',richText:[],coloredRuns:0,warnings:[]});
});

it('records the line of each <h1>–<h3> heading, as copied from Word', () => {
  const html = '<h1><span style="color:#c00000">Kapitel 1</span></h1><p>Text</p><h2>Teil A</h2><p>a<br>b</p><h3>Detail</h3><h4>Klein</h4>';
  const result = convertClipboard(html, '', 'palette');
  expect(result.text).toBe('Kapitel 1\nText\nTeil A\na\nb\nDetail\nKlein');
  expect(result.headings).toEqual({ 0: 1, 2: 2, 5: 3 });
  expect(convertClipboard('<p>no headings</p>', '', 'palette').headings).toBeUndefined();
});
