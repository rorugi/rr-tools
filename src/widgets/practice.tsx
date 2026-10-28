import React, { useEffect, useRef, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { connectPractice, savePractice, startPractice, type PracticeContext, type StartTarget } from '../practice';
import { PRACTICE_DOC_TITLE, PRACTICE_SET_NAME_MAX, PRACTICE_SETS_TITLE } from '../native-practice';
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
  const [saveOpen, setSaveOpen] = useState(false);
  const [setName, setSetName] = useState(() => `Practice set ${new Date().toISOString().slice(0, 10)}`);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [saveError, setSaveError] = useState('');
  const saveLock = useRef(false);
  useEffect(() => {
    let alive = true;
    const connection = connectPractice(plugin);
    connection.result.then(value => { if (alive) setSelection(value); })
      .catch(reason => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; connection.cancel(); };
  }, [plugin]);
  const start = async (target: StartTarget) => {
    if (!selection?.jobId || !selection.cardIds.length || lock.current) return;
    lock.current = true; setAttempted(true); setBusy(true); setError('');
    try { await startPractice(plugin, selection.jobId, target); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  const ready = !!selection?.cardIds.length && !!selection?.jobId;
  const save = async () => {
    if (!selection?.jobId || saveLock.current || !setName.trim()) return;
    saveLock.current = true; setSaving(true); setSaveError('');
    try { setSavedName(await savePractice(plugin, selection.jobId, setName)); }
    catch (reason) { setSaveError(errorMessage(reason)); saveLock.current = false; }
    finally { setSaving(false); }
  };
  const schedule = selection?.schedule; // Absent when an older index answers.
  return <main className="rr-tools rr-paste-dialog rn-clr-background-primary rn-clr-content-primary"
    onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()}>
    <ToolStyles /><h2>Practice Selected Flashcards</h2>
    <div className="rr-paste-body">
      {!selection && !error && <p role="status">Loading selected flashcards…</p>}
      {selection && <>
        <p role="status">{selection.selected} selected Rem(s) · {selection.cardIds.length} flashcard(s) · {selection.skipped} skipped · {selection.errors.length} failed</p>
        {ready && schedule && <p className="rr-schedule" aria-label="Card schedule">
          <b>{schedule.due}</b> due now · <b>{schedule.fresh}</b> new · <b>{schedule.later}</b> not due yet
        </p>}
        {ready && schedule && !schedule.due && !schedule.fresh && <p className="rr-muted">None of the selected cards is due. Use <b>Other practice modes…</b> and choose <b>Practice All Flashcards</b> to practice them anyway.</p>}
        {!!selection.errors.length && <div role="alert"><p>Some selected Rems could not be read:</p>
          <ul className="rr-details">{selection.errors.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </div>}
        {!saveOpen && !savedName && <>
          <p className="rr-muted">Only the selected Rems' cards are included; select child Rems to include theirs. Practice runs in RemNote's flashcard screen through “{PRACTICE_DOC_TITLE}”, which is cleared afterwards.</p>
          {ready && <ul className="rr-muted">
            <li><b>Start practice</b>: due and new cards (spaced repetition).</li>
            <li><b>Other practice modes</b>: all cards, in order, or without recording answers, via the arrow beside the document's Practice button.</li>
          </ul>}
        </>}
        {ready && !attempted && <div className="rr-save">
          {savedName ? <>
            <p role="status">Saved “{savedName}” in “{PRACTICE_SETS_TITLE}”. Practice it anytime with its Practice button.</p>
            <button type="button" className="rn-button" onClick={() => void start('set')}>Open practice set</button>
          </> : saveOpen ? <>
            <label>Practice set name
              <input type="text" aria-label="Practice set name" value={setName} maxLength={PRACTICE_SET_NAME_MAX} disabled={saving} autoFocus
                onChange={e => setSetName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); }} />
            </label>
            <p className="rr-muted">Creates a document in “{PRACTICE_SETS_TITLE}” that links to the selected Rems. They show a reference count while the set exists.</p>
            <div className="rr-actions">
              <button type="button" className="rn-button rr-primary" disabled={saving || !setName.trim()} onClick={() => void save()}>Save</button>
              <button type="button" className="rn-button" disabled={saving} onClick={() => { setSaveOpen(false); setSaveError(''); }}>Cancel</button>
            </div>
            {saving && <p role="status">Saving practice set…</p>}
            {saveError && <p role="alert">{saveError}</p>}
          </> : <button type="button" className="rn-button" onClick={() => setSaveOpen(true)}>Save as practice set…</button>}
        </div>}
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
    </div><div className="rr-version">RR Tools 0.4.14</div></footer>
  </main>;
}
renderWidget(PracticeSelected);
