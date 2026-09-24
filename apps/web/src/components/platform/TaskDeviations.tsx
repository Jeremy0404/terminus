import { useTranslation } from 'react-i18next';
import type { TaskDetailDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { CloseTask } from './CloseTask';
import { useAction } from './useAction';

export function TaskDeviations({ detail }: { detail: TaskDetailDto }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const { task } = detail;
  if (['running', 'done', 'closed'].includes(task.status.kind)) return null;
  const skip = detail.actions.find((action) => action.kind === 'skip-phase');
  const otherTrack = task.track === 'standard' ? 'light' : 'standard';
  return (
    <div className="deviations">
      <div className="row">
        {skip && skip.kind === 'skip-phase' && (
          <button type="button" className="btn small subtle" disabled={busy} onClick={() => void run(() => api.skip(task.id))}>
            {t('deviation.skip', { phase: t(`phase.${skip.phaseId}`) })}
          </button>
        )}
        <button type="button" className="btn small subtle" disabled={busy} onClick={() => void run(() => api.setTrack(task.id, otherTrack))}>
          {t('deviation.switchTrack', { track: t(`track.${otherTrack}`) })}
        </button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
      <CloseTask key={task.id} taskId={task.id} />
    </div>
  );
}
