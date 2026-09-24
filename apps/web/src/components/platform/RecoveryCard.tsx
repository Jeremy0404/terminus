import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckpointDto, SuggestedActionDto, TaskStatusDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

type Option = Extract<SuggestedActionDto, { kind: 'recover' }>['option'];

interface Props {
  readonly taskId: string;
  readonly failure: Extract<TaskStatusDto, { kind: 'blocked' }>['failure'];
  readonly actions: readonly SuggestedActionDto[];
  readonly checkpoints: readonly CheckpointDto[];
  readonly phases: readonly string[];
}

export function RecoveryCard({ taskId, failure, actions, checkpoints, phases }: Props) {
  const { t } = useTranslation();
  const options = actions.filter((action): action is Extract<SuggestedActionDto, { kind: 'recover' }> => action.kind === 'recover');
  const [choice, setChoice] = useState<Option>(options.find((option) => option.isDefault)?.option ?? 'restart-from-checkpoint');
  const [rewindTo, setRewindTo] = useState<number | null>(checkpoints.at(-1)?.sequence ?? null);
  const [command, setCommand] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const apply = (): Promise<void> =>
    run(async () => {
      if (choice === 'take-over') {
        setCommand((await api.takeOver(taskId)).command);
        return;
      }
      await api.recover(taskId, choice, choice === 'rewind' ? (rewindTo ?? undefined) : undefined);
    });

  return (
    <div className="action-card">
      <span className="eyebrow">{t('recovery.eyebrow')}</span>
      <h3>{t(`recovery.title.${failure.kind}`, { defaultValue: t('recovery.title.default') })}</h3>
      <pre className="diagnosis">{failure.message}</pre>
      <div className="options" role="radiogroup" aria-label={t('recovery.eyebrow')}>
        {options.map((option) => (
          <button key={option.option} type="button" role="radio" aria-checked={choice === option.option} className="option" disabled={busy} onClick={() => setChoice(option.option)}>
            <b>
              {t(`recovery.option.${option.option}`)}
              {option.isDefault && <span className="tag good">{t('recovery.default')}</span>}
            </b>
            <span>{t(`recovery.hint.${option.option}`)}</span>
          </button>
        ))}
      </div>
      {choice === 'rewind' && checkpoints.length > 0 && (
        <label className="field">
          <span className="eyebrow">{t('recovery.rewindTo')}</span>
          <select value={rewindTo ?? ''} onChange={(event) => setRewindTo(Number(event.target.value))} disabled={busy}>
            {checkpoints.map((checkpoint) => (
              <option key={checkpoint.sequence} value={checkpoint.sequence}>
                {t('recovery.checkpoint', { sequence: checkpoint.sequence, phase: t(`phase.${phases[checkpoint.phaseIndex] ?? ''}`) })}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void apply()}>{t('recovery.apply')}</button>
      </div>
      {command && (
        <div className="command">
          <code>{command}</code>
          <button type="button" className="btn small" onClick={() => void navigator.clipboard?.writeText(command).catch(() => undefined)}>{t('recovery.copy')}</button>
        </div>
      )}
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
