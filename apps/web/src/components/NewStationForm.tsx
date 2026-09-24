import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

export function NewStationForm({ network, lineId, onDone }: { network: NetworkDto; lineId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const candidates = network.tasks.filter((task) => task.epicId !== lineId && task.status.kind !== 'done');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      await api.createTask(lineId, { title: title.trim(), dependsOn });
      onDone();
    });
  };

  return (
    <form className="create-form" onSubmit={submit} aria-label={t('create.station.title')}>
      <label className="field">
        <span className="eyebrow">{t('create.station.name')}</span>
        <input id="new-station-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('create.station.placeholder')} required />
      </label>
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
              />
              {network.epics.find((epic) => epic.id === task.epicId)?.code} · {task.title}
            </label>
          ))}
        </fieldset>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy || !title.trim()}>{t('create.station.submit')}</button>
        <button type="button" className="btn" onClick={onDone}>{t('create.cancel')}</button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </form>
  );
}
