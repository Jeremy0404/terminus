import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';
import { nextStep } from '../network/next-step';
import { isActive, statusKey, toneOf } from '../network/tone';
import { LineBadge } from './LineBadge';
import { BreakdownPanel } from './BreakdownPanel';
import { NewStationForm } from './NewStationForm';
import { NextStep } from './NextStep';
import { StatusPill } from './StatusPill';
import { ProgressSummary } from './ProgressSummary';

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
  const step = network.inbox.some((item) => item.epicId === lineId) ? null : nextStep(network, lineId);
  return (
    <section className="card" style={{ ['--lc' as string]: lineColor(epic.position) }}>
      <div className="row"><LineBadge epic={epic} /><span className="eyebrow">{t('line.eyebrow')}</span></div>
      <h2>{epic.name}</h2>
      <ProgressSummary tasks={tasks} />
      {epic.description && <p className="epic-description">{epic.description}</p>}
      {step?.kind === 'open-station' && <NextStep step={step} onAct={() => onStation(step.epicId, step.taskId)} />}
      <BreakdownPanel epic={epic} prominent={step?.kind === 'break-down'} />
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
