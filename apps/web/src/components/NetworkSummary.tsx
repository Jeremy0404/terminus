import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { nextStep } from '../network/next-step';
import { NewLineForm } from './NewLineForm';
import { NextStep } from './NextStep';
import { ProgressSummary } from './ProgressSummary';

interface Props {
  readonly network: NetworkDto;
  readonly onStation: (epicId: string, taskId: string) => void;
  readonly onLine: (epicId: string) => void;
  readonly onMemory: () => void;
}

export function NetworkSummary({ network, onStation, onLine, onMemory }: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const running = network.tasks.filter((task) => task.status.kind === 'running').length;
  const step = network.inbox.length === 0 && !adding ? nextStep(network) : null;
  return (
    <section className="card">
      <span className="eyebrow">{t('summary.eyebrow', { app: network.app.name })}</span>
      <div className="stats network-stats">
        <div><b>{network.epics.length}</b><span>{t('summary.lines')}</span></div>

        <div><b>{running}</b><span>{t('summary.running', { count: running })}</span></div>
      </div>
      <ProgressSummary tasks={network.tasks} />
      {step && (
        <NextStep
          step={step}
          onAct={() => {
            if (step.kind === 'open-station') onStation(step.epicId, step.taskId);
            else if (step.kind === 'break-down') onLine(step.epicId);
            else if (step.kind === 'review-memory') onMemory();
            else setAdding(true);
          }}
        />
      )}
      {adding ? (
        <NewLineForm network={network} onDone={() => setAdding(false)} />
      ) : (
        <div className="row card-actions">
          <button type="button" className="btn small" onClick={() => setAdding(true)}>{t('create.line.open')}</button>
        </div>
      )}
    </section>
  );
}
