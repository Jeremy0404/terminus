import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';
import { useTask } from '../state/resources';
import { ActionPanel } from './platform/ActionPanel';
import { AgentPicker } from './platform/AgentPicker';
import { ObsoleteFlag } from './platform/ObsoleteFlag';
import { TaskDeviations } from './platform/TaskDeviations';
import { RunHistory } from './platform/RunHistory';
import { StatusPill } from './StatusPill';

interface Props {
  readonly network: NetworkDto;
  readonly taskId: string;
  readonly onClose: () => void;
}

export function Platform({ network, taskId, onClose }: Props) {
  const { t } = useTranslation();
  const { data, live, error, reload } = useTask(taskId);
  const summary = network.tasks.find((task) => task.id === taskId);
  const epic = network.epics.find((candidate) => candidate.id === summary?.epicId);
  if (!summary || !epic) return null;
  const task = data?.task.id === taskId ? data.task : summary;
  const reached = task.status.kind === 'done' ? task.phases.length : task.phaseIndex;
  const closed = task.status.kind === 'closed';
  return (
    <section className="card platform" style={{ ['--lc' as string]: lineColor(epic.position) }} aria-label={t('platform.label', { title: task.title })}>
      <div className="platform-head">
        <div>
          <span className="eyebrow">{t('platform.eyebrow', { line: epic.name })}</span>
          <h2>{task.title}</h2>
          {task.description && <p className="platform-brief">{task.description}</p>}
        </div>
        <button type="button" className="btn small" onClick={onClose} aria-label={t('platform.close')}>✕</button>
      </div>
      <div className="row">
        <StatusPill status={task.status} />
        <span className="track-chip">{t(`track.${task.track}`)}</span>
        <details className="platform-agent"><summary>{t('platform.agent')}</summary><AgentPicker key={task.id} task={task} /></details>
      </div>
      {network.obsoleteFlags
        .filter((flag) => flag.taskId === taskId)
        .map((flag) => (
          <ObsoleteFlag key={flag.proposalId} flag={flag} />
        ))}
      {!closed && <ol className="phase-strip" style={{ gridTemplateColumns: `repeat(${task.phases.length}, 1fr)`, ['--n' as string]: task.phases.length }}>
        {task.phases.map((phase, index) => (
          <li key={phase} className={`${index < reached ? 'passed' : index === reached && task.status.kind !== 'todo' ? 'current' : ''} ${task.phasesInTrack.includes(phase) ? '' : 'off'}`}>
            <i />
            <span title={t(`phase.${phase}`)}>{t(`phaseShort.${phase}`)}</span>
          </li>
        ))}
      </ol>}
      {!data && !error && <p role="status" className="muted">{t('platform.loading')}</p>}
      {error && <div role="alert"><p>{t('platform.loadError')}</p><button type="button" className="btn" onClick={reload}>{t('platform.retry')}</button></div>}
      {data && data.task.id === taskId && (
        <>
          <ActionPanel detail={data} live={live} />
          {task.status.kind !== 'closed' && task.status.kind !== 'done' && <details className="platform-options"><summary>{t('platform.options')}</summary><TaskDeviations detail={data} /></details>}
          <RunHistory runs={data.runs} checkpoints={data.checkpoints} phases={data.task.phases} />
        </>
      )}
    </section>
  );
}
