import { useTranslation } from 'react-i18next';
import type { TaskDetailDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { DecisionCard } from './DecisionCard';
import { GateCard } from './GateCard';
import { RecoveryCard } from './RecoveryCard';
import { RunLog } from './RunLog';
import { useAction } from './useAction';

export function ActionPanel({ detail, live }: { detail: TaskDetailDto; live: readonly unknown[] }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const { task } = detail;
  const status = task.status;

  switch (status.kind) {
    case 'awaiting-decision': {
      const open = detail.decisions.filter((decision) => decision.phaseIndex === task.phaseIndex);
      const decision = open.find((candidate) => candidate.id === status.decisionId);
      return decision ? <DecisionCard key={decision.id} decision={decision} position={open.indexOf(decision) + 1} total={open.length} /> : null;
    }
    case 'awaiting-gate':
      return <GateCard task={task} gate={status.gate} runs={detail.runs} />;
    case 'blocked':
      return <RecoveryCard taskId={task.id} failure={status.failure} actions={detail.actions} checkpoints={detail.checkpoints} phases={task.phases} />;
    case 'running':
      return (
        <div className="action-card">
          <span className="eyebrow">{t('run.eyebrow', { phase: t(`phase.${task.phases[task.phaseIndex] ?? ''}`) })}</span>
          <RunLog events={live} live />
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.act(task.id, 'interrupt'))}>{t('run.interrupt')}</button>
          </div>
          {error && <p className="action-error" role="alert">{error}</p>}
        </div>
      );
    case 'ready':
      return (
        <div className="action-card">
          <span className="eyebrow">{t(`ready.${status.mode}`)}</span>
          <p className="muted">{t('ready.waiting', { phase: t(`phase.${task.phases[task.phaseIndex] ?? ''}`) })}</p>
          {detail.failures.at(-1) && <pre className="diagnosis">{detail.failures.at(-1)?.message}</pre>}
        </div>
      );
    case 'todo': {
      const canOpen = detail.actions.some((action) => action.kind === 'open-task');
      return (
        <div className="action-card">
          <span className="eyebrow">{t('todo.eyebrow')}</span>
          <p className="muted">{canOpen ? t('todo.ready') : t('todo.waiting')}</p>
          {canOpen && (
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => api.act(task.id, 'open'))}>{t('todo.open')}</button>
            </div>
          )}
          {error && <p className="action-error" role="alert">{error}</p>}
        </div>
      );
    }
    case 'manual':
      return (
        <div className="action-card">
          <span className="eyebrow">{t('manual.eyebrow')}</span>
          <p className="muted">{t('manual.body')}</p>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => api.act(task.id, 'resume-from-manual'))}>{t('manual.resume')}</button>
          </div>
          {error && <p className="action-error" role="alert">{error}</p>}
        </div>
      );
    case 'done':
      return (
        <div className="action-card">
          <span className="eyebrow">{t('done.eyebrow')}</span>
          <p className="muted">{t('done.body')}</p>
        </div>
      );
  }
}
