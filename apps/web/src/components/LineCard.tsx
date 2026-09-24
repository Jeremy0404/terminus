import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';
import { isActive, statusKey, toneOf } from '../network/tone';
import { LineBadge } from './LineBadge';
import { NewStationForm } from './NewStationForm';
import { StatusPill } from './StatusPill';

interface Props {
  readonly network: NetworkDto;
  readonly lineId: string;
  readonly onStation: (epicId: string, taskId: string) => void;
}

export function LineCard({ network, lineId, onStation }: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const epic = network.epics.find((candidate) => candidate.id === lineId);
  if (!epic) return null;
  const tasks = network.tasks.filter((task) => task.epicId === lineId);
  const done = tasks.filter((task) => task.status.kind === 'done').length;
  return (
    <section className="card" style={{ ['--lc' as string]: lineColor(epic.position) }}>
      <div className="row"><LineBadge epic={epic} /><span className="eyebrow">{t('line.eyebrow')}</span></div>
      <h2>{epic.name}</h2>
      <p className="muted">{t('line.progress', { done, total: tasks.length })}</p>
      <ul className="station-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" onClick={() => onStation(epic.id, task.id)}>
              <span className={`station-list-dot tone-${toneOf(task.status)}`} />
              <span className="station-list-name">{task.title}</span>
              {isActive(task.status) ? <StatusPill status={task.status} /> : <span className="muted small">{t(statusKey(task.status))}</span>}
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <NewStationForm network={network} lineId={lineId} onDone={() => setAdding(false)} />
      ) : (
        <div className="row card-actions">
          <button type="button" className="btn small" onClick={() => setAdding(true)}>{t('create.station.open')}</button>
        </div>
      )}
    </section>
  );
}
