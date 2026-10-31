import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppEvents, renderWidget, usePlugin, type RichTextElementTextInterface } from '@remnote/plugin-sdk';
import { PALETTE, type ColorMode } from '../convert';
import { convertPaste } from '../convert-table';
import { readClipboard, type ClipboardPayload } from '../clipboard';
import { connectPaste, requestPaste, type PasteContext } from '../insert';
import { splitLines, type PasteLine } from '../lines';
import { DEFAULT_PASTE_SETTINGS, PASTE_SETTINGS_KEY, readPasteSettings, type PasteSettings } from '../paste-settings';
import { ToolStyles } from '../ui';


function RichRuns({value}: {value: import('@remnote/plugin-sdk').RichTextInterface}) {
  return <>{value.map((run, i) => {
          if (typeof run === 'string') return <React.Fragment key={i}>{run}</React.Fragment>;
          const r = run as RichTextElementTextInterface;
          return <span key={i} style={{ color: typeof r.tc === 'number' ? PALETTE.find(p => p.id === r.tc)?.hex : r.tc,
            fontWeight: r.b ? 'bold' : undefined, fontStyle: r.l ? 'italic' : undefined,
            textDecoration: r.u ? 'underline' : undefined, fontFamily: r.code ? 'monospace' : undefined }}
            className={r.cId ? 'rr-cloze' : undefined} title={r.cId ? `Cloze${r['cloze-hint'] ? ` · hint: ${r['cloze-hint']}` : ''}` : undefined}>{r.text}</span>;
        })}</>;
}

function Paste() {
  const plugin = usePlugin();
  const [context, setContext] = useState<PasteContext>();
  const [setupError, setSetupError] = useState('');
  const [payload, setPayload] = useState<ClipboardPayload>({ html: '', plain: '' });
  const [settings, setSettings] = useState<PasteSettings>(DEFAULT_PASTE_SETTINGS);
  const settingsLoaded = useRef(false);
  const { mode, headerRow, headerColumn, splitLines: split, flashcards } = settings;
  const update = (change: Partial<PasteSettings>) => setSettings(previous => ({ ...previous, ...change }));
  const pasted = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    box.current?.focus();
    connectPaste(plugin, AppEvents.MessageBroadcast, controller.signal).then(value => {
      if (!alive.current) return;
      setContext(value);
    }).catch(e => { if (alive.current) setSetupError(e instanceof Error ? e.message : String(e)); });
    // Remembered options; a storage failure only means the defaults are used.
    Promise.resolve().then(() => plugin.storage.getSynced(PASTE_SETTINGS_KEY)).then(value => {
      if (alive.current && !settingsLoaded.current) setSettings(readPasteSettings(value));
    }).catch(() => {}).finally(() => { settingsLoaded.current = true; });
    // Prefill from the clipboard when RemNote allows reading it; otherwise Ctrl+V still works.
    (async () => {
      let value: ClipboardPayload | undefined;
      try { value = await readClipboard(navigator.clipboard); }
      catch { try { const text = await navigator.clipboard?.readText?.(); if (text) value = { html: '', plain: text }; } catch { /* not allowed */ } }
      if (value && alive.current && !pasted.current && (value.html || value.plain)) setPayload(value);
    })();
    return () => { alive.current = false; controller.abort(); };
  }, [plugin]);
  useEffect(() => {
    if (!settingsLoaded.current) return;
    try { void plugin.storage.setSynced(PASTE_SETTINGS_KEY, settings).catch(() => {}); } catch { /* storage unavailable: defaults next time */ }
  }, [plugin, settings]);
  const converted = useMemo(() => {
    try { return { value: convertPaste(payload.html, payload.plain, mode, { headerRow, headerColumn }), error: '' }; }
    catch (e) { return { value: undefined, error: e instanceof Error ? e.message : 'Conversion failed.' }; }
  }, [payload, mode, headerRow, headerColumn]);
  const toDocument = context?.target === 'document';
  /** Lines become separate Rems when splitting is on, and always for Multi-Paste into a document. */
  const linesFor = (value: typeof converted.value): PasteLine[] | undefined => {
    if (!value?.text || value.table) return undefined;
    if (split) return splitLines(value.richText, flashcards);
    return toDocument ? [{ front: value.richText, text: value.text }] : undefined;
  };
  const lines = useMemo(() => {
    try { return { value: linesFor(converted.value), error: '' }; }
    catch (e) { return { value: undefined, error: e instanceof Error ? e.message : String(e) }; }
  }, [converted, split, flashcards, toDocument]);
  const cards = lines.value?.filter(line => line.back || line.clozes).length ?? 0;
  const problem = converted.error || lines.error;
  const paste = async () => {
    if (lock.current || attempted || !context?.jobId) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let value = converted.value;
      // One primary action: with an empty box, try reading and inserting directly.
      if (!payload.html && !payload.plain) {
        const clipboard = await readClipboard(navigator.clipboard);
        setPayload(clipboard);
        value = convertPaste(clipboard.html, clipboard.plain, mode, { headerRow, headerColumn });
        // A directly read table or line list needs a preview before anything is created.
        if (value.table || split || toDocument) return;
      }
      if (!value?.text && !value?.table) throw new Error(problem || 'No text to paste. Copy text, then press Ctrl+V in the paste box.');
      if (value.table && !context.supportsTables) throw new Error('The running RR Tools command does not support tables yet. Restart the server and disable/re-enable RR Tools, then reopen this popup.');
      let send = linesFor(value);
      // A single plain line still goes in at the caret, exactly like an ordinary paste.
      if (send && !toDocument && send.length === 1 && !send[0].back) send = undefined;
      if (send && !context.supportsLines) throw new Error('The running RR Tools command cannot create Rems from lines yet. Disable and re-enable RR Tools, then reopen this popup.');
      setAttempted(true);
      await requestPaste(plugin, AppEvents.MessageBroadcast, context.jobId, value.richText, value.table, send);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <main className="rr-tools rr-paste-dialog rn-clr-background-primary rn-clr-content-primary"
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <ToolStyles />
    <h2>{toDocument ? 'Multi-Paste' : 'Paste with colors'}</h2>
    <div className="rr-paste-body" role="region" aria-label="Paste options and preview" tabIndex={0}>
      <p className="rr-muted">{converted.value?.table
        ? `Click Paste to add this table inside a new “Pasted table” child under ${toDocument ? `“${context?.destinationName}”` : 'your destination Rem'}. Existing text is kept.`
        : toDocument ? `Each line becomes a new Rem at the end of “${context?.destinationName}”. Press Ctrl+V here (Mac: Cmd+V) to replace the text.`
        : split ? 'Each line becomes a new Rem below your original Rem (an empty Rem is filled with the first line). Press Ctrl+V here (Mac: Cmd+V) to replace the text.'
        : 'Press Ctrl+V here (Mac: Cmd+V), then click Paste to insert into your original Rem. If the box is empty, Paste tries reading the clipboard.'}</p>
      {converted.value?.table && <div className="rr-table-options" role="group" aria-label="Table headers">
        <label><input type="checkbox" checked={headerRow} disabled={busy || attempted} onChange={event => update({ headerRow: event.target.checked })} /> Header Row</label>
        <label title="Use the first column as headers"><input type="checkbox" checked={headerColumn} disabled={busy || attempted} onChange={event => update({ headerColumn: event.target.checked })} /> Column Row</label>
      </div>}
      {!converted.value?.table && <div className="rr-table-options" role="group" aria-label="Line options">
        <label><input type="checkbox" checked={split} disabled={busy || attempted} onChange={event => update({ splitLines: event.target.checked })} /> Split lines into separate Rems</label>
        <label title="Lines with >>, << or <> become forward, backward or two-way flashcards; {{…}} becomes a cloze"><input type="checkbox" checked={flashcards} disabled={busy || attempted || !split} onChange={event => update({ flashcards: event.target.checked })} /> Create flashcards from &gt;&gt; &lt;&lt; &lt;&gt; {'{{ }}'}</label>
      </div>}
      <div ref={box} className="rr-paste-box" role="textbox" aria-label="Paste copied text here" aria-multiline="true"
        aria-readonly="true" aria-disabled={busy || attempted} tabIndex={0} contentEditable suppressContentEditableWarning
        data-empty={!converted.value?.text && !converted.value?.table} onBeforeInput={event => event.preventDefault()}
        onCut={event => event.preventDefault()} onDrop={event => event.preventDefault()}
        onKeyDown={event => {
          // A paste-only surface: DOM edits must not diverge from the converted payload.
          if (['Backspace', 'Delete', 'Enter'].includes(event.key) || event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
        }}
        onPaste={event => {
          event.preventDefault();
          if (lock.current || attempted) return;
          setError('');
          pasted.current = true;
          setPayload({ html: event.clipboardData.getData('text/html'), plain: event.clipboardData.getData('text/plain') });
          if (box.current) box.current.scrollTop = 0;
        }}>
        {converted.value?.table ? converted.value.table.parts.map((part, i) => part.kind === 'text'
          ? <p key={i}><RichRuns value={part.richText} /></p>
          : <table key={i} className="rr-paste-table"><tbody>{part.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => {
              const Cell = cell.header ? 'th' : 'td';
              return <Cell key={c} scope={cell.headerScope} rowSpan={cell.rowSpan} colSpan={cell.colSpan}><RichRuns value={cell.richText} /></Cell>;
            })}</tr>)}</tbody></table>)
          : lines.value && (split || toDocument) ? <ol className="rr-lines" aria-label="Pasted lines">{lines.value.map((line, i) => <li key={i}>
              <RichRuns value={line.front} />
              {line.back && <><span className="rr-card-arrow" title={`${line.direction} flashcard`}>{line.direction === 'backward' ? ' ← ' : line.direction === 'both' ? ' ↔ ' : ' → '}</span><RichRuns value={line.back} /></>}
            </li>)}</ol>
          : converted.value && <RichRuns value={converted.value.richText} />}
      </div>
      {(converted.value?.text || converted.value?.table) && <p role="status" className="rr-muted">{converted.value?.table ? `${converted.value.table.tableCount} table(s) · ${converted.value.table.cellCount} cells` : lines.value && (split || toDocument) ? `${lines.value.length} Rem(s)${flashcards && split ? ` · ${cards} flashcard(s)` : ''}` : payload.html ? 'Formatting received' : 'Plain text received — no source colors'} · {converted.value.coloredRuns} colored text segments · {converted.value.text.length} characters</p>}
      <label style={{ display: 'block', marginTop: 12 }}>Colors
        <select disabled={busy || attempted} value={mode} onChange={e => update({ mode: e.target.value as ColorMode })}>
          <option value="palette">RemNote palette (approximate)</option>
          <option value="exact">Exact RGB (experimental)</option>
          <option value="plain">Plain text only</option>
        </select>
      </label>
      {!!converted.value?.warnings.length && <ul className="rr-muted">{converted.value.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    </div>
    <footer className="rr-paste-footer">
      {!context && !setupError && <p role="status" className="rr-muted">Connecting to the destination Rem…</p>}
      {(setupError || error || problem) && <p id="rr-paste-error" role="alert" className="rr-paste-error">{setupError || error || problem}</p>}
      <div className="rr-actions">
        <button type="button" className="rn-button rr-primary" aria-describedby={setupError || error || problem ? 'rr-paste-error' : undefined} disabled={busy || attempted || !context?.jobId} onClick={paste}>{busy ? 'Pasting…' : 'Paste'}</button>
        <button type="button" className="rn-button" disabled={busy} onClick={() => plugin.widget.closePopup(true)}>{attempted ? 'Close' : 'Cancel'}</button>
      </div>
      <div className="rr-version">RR Tools 0.4.17</div>
    </footer>
  </main>;
}
renderWidget(Paste);
