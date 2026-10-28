import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppEvents, renderWidget, usePlugin, type RichTextElementTextInterface } from '@remnote/plugin-sdk';
import { PALETTE, type ColorMode } from '../convert';
import { convertPaste } from '../convert-table';
import { readClipboard, type ClipboardPayload } from '../clipboard';
import { connectPaste, requestPaste, type PasteContext } from '../insert';
import { ToolStyles } from '../ui';


function RichRuns({value}: {value: import('@remnote/plugin-sdk').RichTextInterface}) {
  return <>{value.map((run, i) => {
          if (typeof run === 'string') return <React.Fragment key={i}>{run}</React.Fragment>;
          const r = run as RichTextElementTextInterface;
          return <span key={i} style={{ color: typeof r.tc === 'number' ? PALETTE.find(p => p.id === r.tc)?.hex : r.tc,
            fontWeight: r.b ? 'bold' : undefined, fontStyle: r.l ? 'italic' : undefined,
            textDecoration: r.u ? 'underline' : undefined, fontFamily: r.code ? 'monospace' : undefined }}>{r.text}</span>;
        })}</>;
}

function Paste() {
  const plugin = usePlugin();
  const [context, setContext] = useState<PasteContext>();
  const [setupError, setSetupError] = useState('');
  const [payload, setPayload] = useState<ClipboardPayload>({ html: '', plain: '' });
  const [mode, setMode] = useState<ColorMode>('palette');
  const [headerRow, setHeaderRow] = useState(false);
  const [headerColumn, setHeaderColumn] = useState(false);
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
    return () => { alive.current = false; controller.abort(); };
  }, [plugin]);
  const converted = useMemo(() => {
    try { return { value: convertPaste(payload.html, payload.plain, mode, { headerRow, headerColumn }), error: '' }; }
    catch (e) { return { value: undefined, error: e instanceof Error ? e.message : 'Conversion failed.' }; }
  }, [payload, mode, headerRow, headerColumn]);
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
        // A directly read table needs a preview so its header options can be chosen.
        if (value.table) return;
      }
      if (!value?.text && !value?.table) throw new Error(converted.error || 'No text to paste. Copy text, then press Ctrl+V in the paste box.');
      if (value.table && !context.supportsTables) throw new Error('The running RR Tools command does not support tables yet. Restart the server and disable/re-enable RR Tools, then reopen this popup.');
      setAttempted(true);
      await requestPaste(plugin, AppEvents.MessageBroadcast, context.jobId, value.richText, value.table);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <main className="rr-tools rr-paste-dialog rn-clr-background-primary rn-clr-content-primary"
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <ToolStyles />
    <h2>Paste with colors</h2>
    <div className="rr-paste-body" role="region" aria-label="Paste options and preview" tabIndex={0}>
      <p className="rr-muted">{converted.value?.table ? 'Click Paste to add this table inside a new “Pasted table” child under your destination Rem. Existing text is kept.' : 'Press Ctrl+V here (Mac: Cmd+V), then click Paste to insert into your original Rem. If the box is empty, Paste tries reading the clipboard.'}</p>
      {converted.value?.table && <div className="rr-table-options" role="group" aria-label="Table headers">
        <label><input type="checkbox" checked={headerRow} disabled={busy || attempted} onChange={event => setHeaderRow(event.target.checked)} /> Header Row</label>
        <label title="Use the first column as headers"><input type="checkbox" checked={headerColumn} disabled={busy || attempted} onChange={event => setHeaderColumn(event.target.checked)} /> Column Row</label>
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
          setHeaderRow(false); setHeaderColumn(false);
          setPayload({ html: event.clipboardData.getData('text/html'), plain: event.clipboardData.getData('text/plain') });
          if (box.current) box.current.scrollTop = 0;
        }}>
        {converted.value?.table ? converted.value.table.parts.map((part, i) => part.kind === 'text'
          ? <p key={i}><RichRuns value={part.richText} /></p>
          : <table key={i} className="rr-paste-table"><tbody>{part.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => {
              const Cell = cell.header ? 'th' : 'td';
              return <Cell key={c} scope={cell.headerScope} rowSpan={cell.rowSpan} colSpan={cell.colSpan}><RichRuns value={cell.richText} /></Cell>;
            })}</tr>)}</tbody></table>)
          : converted.value && <RichRuns value={converted.value.richText} />}
      </div>
      {(converted.value?.text || converted.value?.table) && <p role="status" className="rr-muted">{converted.value?.table ? `${converted.value.table.tableCount} table(s) · ${converted.value.table.cellCount} cells` : payload.html ? 'Formatting received' : 'Plain text received — no source colors'} · {converted.value.coloredRuns} colored text segments · {converted.value.text.length} characters</p>}
      <label style={{ display: 'block', marginTop: 12 }}>Colors
        <select disabled={busy || attempted} value={mode} onChange={e => setMode(e.target.value as ColorMode)}>
          <option value="palette">RemNote palette (approximate)</option>
          <option value="exact">Exact RGB (experimental)</option>
          <option value="plain">Plain text only</option>
        </select>
      </label>
      {!!converted.value?.warnings.length && <ul className="rr-muted">{converted.value.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    </div>
    <footer className="rr-paste-footer">
      {!context && !setupError && <p role="status" className="rr-muted">Connecting to the destination Rem…</p>}
      {(setupError || error || converted.error) && <p id="rr-paste-error" role="alert" className="rr-paste-error">{setupError || error || converted.error}</p>}
      <div className="rr-actions">
        <button type="button" className="rn-button rr-primary" aria-describedby={setupError || error || converted.error ? 'rr-paste-error' : undefined} disabled={busy || attempted || !context?.jobId} onClick={paste}>{busy ? 'Pasting…' : 'Paste'}</button>
        <button type="button" className="rn-button" disabled={busy} onClick={() => plugin.widget.closePopup(true)}>{attempted ? 'Close' : 'Cancel'}</button>
      </div>
      <div className="rr-version">RR Tools 0.4.14</div>
    </footer>
  </main>;
}
renderWidget(Paste);
