import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';
import { useTask } from '../state/resources';
import { ActionPanel } from './platform/ActionPanel';
import { AgentPicker } from './platform/AgentPicker';
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
  const { data, live } = useTask(taskId);
  const summary = network.tasks.find((task) => task.id === taskId);
  const epic = network.epics.find((candidate) => candidate.id === summary?.epicId);
  if (!summary || !epic) return null;
  const task = data?.task ?? summary;
  const reached = task.status.kind === 'done' ? task.phases.length : task.phaseIndex;
  return (
    <section className="card platform" style={{ ['--lc' as string]: lineColor(epic.position) }} aria-label={t('platform.label', { title: task.title })}>
      <div className="platform-head">
        <div>
          <span className="eyebrow">{t('platform.eyebrow', { line: epic.name })}</span>
          <h2>{task.title}</h2>
        </div>
        <button type="button" className="btn small" onClick={onClose} aria-label={t('platform.close')}>✕</button>
      </div>
      <div className="row">
        <StatusPill status={task.status} />
        <span className="track-chip">{t(`track.${task.track}`)}</span>
        <AgentPicker key={task.id} task={task} />
      </div>
      <ol className="phase-strip" style={{ gridTemplateColumns: `repeat(${task.phases.length}, 1fr)`, ['--n' as string]: task.phases.length }}>
        {task.phases.map((phase, index) => (
          <li key={phase} className={`${index < reached ? 'passed' : index === reached && task.status.kind !== 'todo' ? 'current' : ''} ${task.phasesInTrack.includes(phase) ? '' : 'off'}`}>
            <i />
            <span title={t(`phase.${phase}`)}>{t(`phaseShort.${phase}`)}</span>
          </li>
        ))}
      </ol>
      {data && data.task.id === taskId && (
        <>
          <ActionPanel detail={data} live={live} />
          <TaskDeviations detail={data} />
          <RunHistory runs={data.runs} checkpoints={data.checkpoints} phases={data.task.phases} />
        </>
      )}
    </section>
  );
}
