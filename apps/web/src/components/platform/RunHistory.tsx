import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckpointDto, RunDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { describeChoice } from '../agent/AgentChoiceFields';
import { RunLog } from './RunLog';

const REPLAY_STEP_MS = 180;

export function RunHistory({ runs, checkpoints, phases }: { runs: readonly RunDto[]; checkpoints: readonly CheckpointDto[]; phases: readonly string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly unknown[]>([]);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.transcript(open).then((loaded) => {
      if (cancelled) return;
      setEvents(loaded);
      setShown(0);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || shown >= events.length) return;
    const timer = setTimeout(() => setShown(shown + 1), REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [open, shown, events.length]);

  if (runs.length === 0 && checkpoints.length === 0) return null;
  return (
    <details className="history">
      <summary>{t('history.title', { runs: runs.length, checkpoints: checkpoints.length })}</summary>
      <ol className="runs">
        {[...runs].reverse().map((run) => (
          <li key={run.id}>
            <span className={`run-status run-${run.status}`}>{t(`run.status.${run.status}`)}</span>
            <span>{t(`phase.${phases[run.phaseIndex] ?? ''}`)}</span>
            {run.usage && <span className="muted small">{t('run.tokens', { count: run.usage.inputTokens + run.usage.outputTokens })}</span>}
            {describeChoice(run.agent, t) && <span className="muted small">{describeChoice(run.agent, t)}</span>}
            <button type="button" className="btn small" onClick={() => setOpen(open === run.id ? null : run.id)}>
              {open === run.id ? t('history.close') : t('history.replay')}
            </button>
            {open === run.id && <RunLog events={events.slice(0, shown)} live={shown < events.length} />}
          </li>
        ))}
      </ol>
      {checkpoints.length > 0 && (
        <ul className="checkpoints">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.sequence}>◆ {checkpoint.ref.split('/').slice(-1)[0]} · {t(`phase.${phases[checkpoint.phaseIndex] ?? ''}`)}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
