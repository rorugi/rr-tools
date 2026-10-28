import React, { useEffect, useRef, useState } from 'react';
import { AppEvents, renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { DIRECTIONS, errorMessage, selectedIds, type Direction, type DirectionResult } from '../directions';
import { requestDirectionChange, type DirectionContext } from '../direction-service';
import { ToolStyles } from '../ui';

export function DirectionsPopup() {
  const plugin = usePlugin();
  const [ids, setIds] = useState<string[]>([]);
  const [context, setContext] = useState<DirectionContext>();
  const [attempted, setAttempted] = useState(false);
  const [from, setFrom] = useState<Direction>('forward');
  const [to, setTo] = useState<Direction>('both');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DirectionResult>();
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    plugin.widget.getWidgetContext<WidgetLocation.Popup>().then((context) => {
      if (alive) {
        const snapshot = selectedIds(context.contextData?.remIds);
        setIds(snapshot);
        setContext(context.contextData);
        if (!snapshot.length) setError('No selected Rems were captured. Close this popup and select the Rems again.');
      }
    }).catch((e) => { if (alive) setError(`Could not load the selection: ${errorMessage(e)}`); });
    return () => { alive = false; };
  }, [plugin]);
  const apply = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (lock.current || attempted || !context?.jobId || !context.readable || !ids.length || from === to) return;
    lock.current = true; setBusy(true); setError('');
    setAttempted(true);
    try { setResult(await requestDirectionChange(plugin, AppEvents.MessageBroadcast, context.jobId, from, to)); }
    catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <main className="rr-tools rn-clr-background-primary rn-clr-content-primary"
    onPointerDown={(event) => event.stopPropagation()}
    onMouseDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}>
    <ToolStyles />
    <h2>Change flashcard directions</h2>
    <p className="rr-muted">{ids.length} selected · {context?.readable ?? 0} accessible</p>
    <div className="rr-fields">
      <label>From<select aria-label="From" value={from} disabled={busy || attempted} onChange={(e) => setFrom(e.target.value as Direction)}>
        {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select></label>
      <label>To<select aria-label="To" value={to} disabled={busy || attempted} onChange={(e) => setTo(e.target.value as Direction)}>
        {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select></label>
    </div>
    {from === to && <p>Choose different From and To directions.</p>}
    <p className="rr-muted">Only selected flashcards matching From will change. Unselected children stay unchanged.</p>
    {!!context?.accessErrors?.length && !result && <div role="alert">
      <p>The main plugin could not read {context.accessErrors.length} selected Rem(s), before opening this popup.</p>
      <p>Install RR Tools 0.4.13 as a new plugin (ID: rr-tools) and approve whole-knowledge-base access. Disable the old RR Copy Paste installation to avoid duplicate commands. A hot reload does not update installed permissions.</p>
      <ul className="rr-details">{context.accessErrors.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>}
    {busy && <p role="status" aria-live="polite">Changing flashcards… Results will appear here. Keep this popup open.</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" aria-live="polite"><p className="rr-summary"><strong>{result.changed} changed</strong> · {result.skipped} skipped · {result.failed} failed</p>
      {result.changed === 0 && result.failed === 0 && <p>No selected flashcards matched the From direction.</p>}
      {result.failed > 0 && <>
        <p>RemNote could not confirm these changes. Details for each failed Rem:</p>
        <ul aria-label="Failure details" className="rr-details">
          {result.errors.map((failure) => <li key={failure.remId}>
            <strong>Rem {failure.remId} — {failure.stage}</strong><br />{failure.message}
          </li>)}
        </ul>
      </>}</div>}
    <div className="rr-actions">
      {(!attempted || busy) && <button key="apply" type="button" className="rn-button rr-primary" onClick={apply} disabled={busy || attempted || !context?.readable || !context?.jobId || !ids.length || from === to}>{busy ? 'Changing…' : 'Change selected flashcards'}</button>}
      <button key="close" type="button" className="rn-button" disabled={busy} onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!lock.current) void plugin.widget.closePopup(true); }}>{attempted ? 'Close' : 'Cancel'}</button>
    </div>
    <div className="rr-version">RR Tools 0.4.13</div>
  </main>;
}
renderWidget(DirectionsPopup);
