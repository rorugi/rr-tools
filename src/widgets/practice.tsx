import React, { useEffect, useRef, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { connectPractice, savePractice, startPractice, type PracticeContext, type StartTarget } from '../practice';
import { PRACTICE_DOC_TITLE, PRACTICE_SET_NAME_MAX, PRACTICE_SETS_TITLE, type PracticeSetResult } from '../native-practice';
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
  /** Which practice-set form is open: none, save as a new set, or add to an existing set. */
  const [form, setForm] = useState<'none' | 'save' | 'add'>('none');
  const [setName, setSetName] = useState(() => `Practice set ${new Date().toISOString().slice(0, 10)}`);
  const [targetSet, setTargetSet] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'saved' | 'added'; set: PracticeSetResult }>();
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
  const sets = selection?.sets ?? [];
  const chosenSet = sets.some(set => set._id === targetSet) ? targetSet : sets[0]?._id ?? '';
  const save = async () => {
    const adding = form === 'add';
    if (!selection?.jobId || saveLock.current || (adding ? !chosenSet : !setName.trim())) return;
    saveLock.current = true; setSaving(true); setSaveError('');
    try {
      const set = await savePractice(plugin, selection.jobId, adding ? { setId: chosenSet } : { name: setName });
      setResult({ kind: adding ? 'added' : 'saved', set });
    }
    catch (reason) { setSaveError(errorMessage(reason)); saveLock.current = false; }
    finally { setSaving(false); }
  };
  const cancelForm = () => { setForm('none'); setSaveError(''); };
  const formStatus = <>
    {saving && <p role="status">{form === 'add' ? 'Adding to practice set…' : 'Saving practice set…'}</p>}
    {saveError && <p role="alert">{saveError}</p>}
  </>;
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
        {form === 'none' && !result && <>
          <p className="rr-muted">Only the selected Rems' cards are included; select child Rems to include theirs. Practice runs in RemNote's flashcard screen through “{PRACTICE_DOC_TITLE}”, which is cleared afterwards.</p>
          {ready && <ul className="rr-muted">
            <li><b>Start practice</b>: due and new cards (spaced repetition).</li>
            <li><b>Other practice modes</b>: all cards, in order, or without recording answers, via the arrow beside the document's Practice button.</li>
          </ul>}
        </>}
        {ready && !attempted && <div className="rr-save">
          {result ? <>
            <p role="status">{result.kind === 'saved'
              ? <>Saved “{result.set.name}” in “{PRACTICE_SETS_TITLE}”. Practice it anytime with its Practice button.</>
              : result.set.added
                ? <>Added {result.set.added} Rem(s) to “{result.set.name}”{result.set.already ? <> ({result.set.already} already in it)</> : null}.</>
                : <>All selected Rems are already in “{result.set.name}”.</>}</p>
            <button type="button" className="rn-button" onClick={() => void start('set')}>Open practice set</button>
          </> : form === 'add' ? <>
            <label>Practice set
              <select aria-label="Practice set" value={chosenSet} disabled={saving} onChange={e => setTargetSet(e.target.value)}>
                {sets.map(set => <option key={set._id} value={set._id}>{set.name}</option>)}
              </select>
            </label>
            <p className="rr-muted">Adds the selected Rems that are not in the set yet, at its end.</p>
            <div className="rr-actions">
              <button type="button" className="rn-button rr-primary" disabled={saving || !chosenSet} onClick={() => void save()}>Add</button>
              <button type="button" className="rn-button" disabled={saving} onClick={cancelForm}>Cancel</button>
            </div>
            {formStatus}
          </> : form === 'save' ? <>
            <label>Practice set name
              <input type="text" aria-label="Practice set name" value={setName} maxLength={PRACTICE_SET_NAME_MAX} disabled={saving} autoFocus
                onChange={e => setSetName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); }} />
            </label>
            <p className="rr-muted">Creates a document in “{PRACTICE_SETS_TITLE}” that links to the selected Rems. They show a reference count while the set exists.</p>
            <div className="rr-actions">
              <button type="button" className="rn-button rr-primary" disabled={saving || !setName.trim()} onClick={() => void save()}>Save</button>
              <button type="button" className="rn-button" disabled={saving} onClick={cancelForm}>Cancel</button>
            </div>
            {formStatus}
          </> : <div className="rr-actions">
            <button type="button" className="rn-button" onClick={() => setForm('save')}>Save as practice set…</button>
            {sets.length > 0 && <button type="button" className="rn-button" onClick={() => setForm('add')}>Add to practice set…</button>}
          </div>}
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
    </div><div className="rr-version">RR Tools 0.4.17</div></footer>
  </main>;
}
renderWidget(PracticeSelected);
