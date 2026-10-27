import React, { useEffect, useRef, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { connectPractice, startPractice, type PracticeContext } from '../practice';
import { PRACTICE_DOC_TITLE, type PracticeTarget } from '../native-practice';
import { errorMessage } from '../directions';
import { ToolStyles } from '../ui';

/** Setup only: practice itself always runs in RemNote's own flashcard screen, never in this popup. */
export function PracticeSelected() {
  const plugin = usePlugin();
  const [selection, setSelection] = useState<PracticeContext>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    const connection = connectPractice(plugin);
    connection.result.then(value => { if (alive) setSelection(value); })
      .catch(reason => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; connection.cancel(); };
  }, [plugin]);
  const start = async (target: PracticeTarget) => {
    if (!selection?.jobId || !selection.cardIds.length || lock.current) return;
    lock.current = true; setAttempted(true); setBusy(true); setError('');
    try { await startPractice(plugin, selection.jobId, target); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  const ready = !!selection?.cardIds.length && !!selection?.jobId;
  return <main className="rr-tools rr-paste-dialog rn-clr-background-primary rn-clr-content-primary"
    onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}>
    <ToolStyles /><h2>Practice Selected Flashcards</h2>
    <div className="rr-paste-body">
      {!selection && !error && <p role="status">Loading selected flashcards…</p>}
      {selection && <>
        <p role="status">{selection.selected} selected Rem(s) · {selection.cardIds.length} flashcard(s) · {selection.skipped} skipped · {selection.errors.length} failed</p>
        {!!selection.errors.length && <div role="alert"><p>Some selected Rems could not be read:</p>
          <ul className="rr-details">{selection.errors.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>}
        <p className="rr-muted">Only the selected Rems' cards are included. Select child Rems as well to include their cards.</p>
        {ready && <p className="rr-muted">Practice opens in RemNote's flashcard screen. RR Tools lists the selected Rems in the document “{PRACTICE_DOC_TITLE}”, whose queue contains exactly their cards. The list is cleared when practice ends, so no reference count stays on your Rems.</p>}
        {ready && <ul className="rr-muted">
          <li><b>Start practice</b>: cards that are due, with spaced repetition.</li>
          <li><b>Other practice modes</b>: opens the document. Use the arrow beside its Practice button for all cards, in order, or without recording answers.</li>
        </ul>}
        {!selection.cardIds.length && <p>No enabled flashcards were found in the selection.</p>}
      </>}
      {busy && <p role="status">Opening flashcards…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    <footer className="rr-paste-footer"><div className="rr-actions">
      {!attempted && <button type="button" className="rn-button rr-primary" disabled={!ready} onClick={() => void start('queue')}>
        {selection?.errors.length ? 'Practice available flashcards' : 'Start practice'}
      </button>}
      {!attempted && <button type="button" className="rn-button" disabled={!ready} onClick={() => void start('modes')}>Other practice modes…</button>}
      <button type="button" className="rn-button" disabled={busy} onClick={() => void plugin.widget.closePopup(false)}>Close</button>
    </div><div className="rr-version">RR Tools 0.4.12</div></footer>
  </main>;
}
renderWidget(PracticeSelected);
