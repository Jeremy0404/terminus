import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto, StationDraftDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

export function NewStationForm({ network, lineId, onDone }: { network: NetworkDto; lineId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [understanding, setUnderstanding] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [light, setLight] = useState(false);
  const drafting = useAction();
  const adding = useAction();
  const busy = drafting.busy || adding.busy;
  const stage = drafting.error !== null ? 'failed' : understanding !== null ? 'proposed' : 'writing';
  const candidates = network.tasks.filter((task) => task.epicId !== lineId && task.status.kind !== 'done');

  const propose = (draft: StationDraftDto): void => {
    setUnderstanding(draft.understanding);
    setTitle(draft.title);
    setSummary(draft.summary);
  };

  const format = (): Promise<void> =>
    drafting.run(async () => {
      try {
        propose(await api.draftStation(lineId, text.trim()));
      } catch (cause) {
        setUnderstanding(null);
        throw cause;
      }
    });

  const add = (station: { title: string; description: string }): Promise<void> =>
    adding.run(async () => {
      await api.createTask(lineId, { ...station, dependsOn, track: light ? 'light' : 'standard' });
      onDone();
    });

  const addProposal = (): Promise<void> => add({ title: title.trim(), description: summary.trim() });
  const addAsTyped = (): Promise<void> => add({ title: text.replace(/\s+/g, ' ').trim(), description: text.trim() });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void (stage === 'proposed' ? addProposal() : format());
  };

  return (
    <form className="create-form" onSubmit={submit} aria-label={t('create.station.title')}>
      <label className="field">
        <span className="eyebrow">{t('create.station.text')}</span>
        <textarea id="new-station-text" className="free-answer brief" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('create.station.placeholder')} disabled={busy} />
      </label>
      {stage === 'proposed' && (
        <div className="station-draft">
          {understanding && (
            <div className="field">
              <span className="eyebrow">{t('create.station.understanding')}</span>
              <p className="station-draft-understanding">{understanding}</p>
            </div>
          )}
          <label className="field">
            <span className="eyebrow">{t('create.station.name')}</span>
            <input id="new-station-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span className="eyebrow">{t('create.station.summary')}</span>
            <textarea id="new-station-summary" className="free-answer brief" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={busy} />
          </label>
        </div>
      )}
      {candidates.length > 0 && (
        <fieldset className="field">
          <legend className="eyebrow">{t('create.station.dependsOn')}</legend>
          {candidates.map((task) => (
            <label key={task.id} className="check">
              <input
                id={`depends-${task.id}`}
                type="checkbox"
                checked={dependsOn.includes(task.id)}
                onChange={(event) => setDependsOn(event.target.checked ? [...dependsOn, task.id] : dependsOn.filter((id) => id !== task.id))}
                disabled={busy}
              />
              {network.epics.find((epic) => epic.id === task.epicId)?.code} · {task.title}
            </label>
          ))}
        </fieldset>
      )}
      <label className="check">
        <input id="new-station-light" type="checkbox" checked={light} onChange={(event) => setLight(event.target.checked)} disabled={busy} />
        {t('track.lightHint')}
      </label>
      <div className="row">
        {stage === 'proposed' ? (
          <>
            <button type="submit" className="btn primary" disabled={busy || !title.trim()}>{t('create.station.submit')}</button>
            <button type="button" className="btn" onClick={() => void format()} disabled={busy || !text.trim()}>{t('create.station.rerun')}</button>
          </>
        ) : (
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}>{t(stage === 'failed' ? 'create.station.rerun' : 'create.station.format')}</button>
        )}
        {stage === 'failed' && (
          <button type="button" className="btn" onClick={() => void addAsTyped()} disabled={busy || !text.trim()}>{t('create.station.asTyped')}</button>
        )}
        <button type="button" className="btn" onClick={onDone} disabled={busy}>{t('create.cancel')}</button>
      </div>
      {stage === 'failed' && <p className="action-error" role="alert">{t('create.station.failed', { error: drafting.error })}</p>}
      {adding.error && <p className="action-error" role="alert">{adding.error}</p>}
    </form>
  );
}
