import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CloseReasonDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

const REASONS: readonly CloseReasonDto[] = ['already-done', 'obsolete', 'duplicate', 'abandoned'];

export function CloseTask({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CloseReasonDto | null>(null);
  const [evidence, setEvidence] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const { busy, error, run } = useAction();

  if (!open) {
    return (
      <div className="row close-task">
        <button type="button" className="btn small subtle" onClick={() => setOpen(true)}>{t('closeTask.open')}</button>
      </div>
    );
  }

  return (
    <div className="close-task">
      <div className="options" role="radiogroup" aria-label={t('closeTask.open')}>
        {REASONS.map((candidate) => (
          <button key={candidate} type="button" role="radio" aria-checked={reason === candidate} className="option compact" onClick={() => setReason(candidate)}>
            <b>{t(`closeTask.reason.${candidate}`)}</b>
          </button>
        ))}
      </div>
      <input
        id={`close-evidence-${taskId}`}
        className="free-answer"
        aria-label={t('closeTask.evidence')}
        placeholder={t('closeTask.evidence')}
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
      />
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={busy || reason === null}
          onClick={() => reason && void run(async () => setWarnings((await api.close(taskId, reason, evidence.trim())).warnings))}
        >
          {t('closeTask.submit')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>{t('create.cancel')}</button>
      </div>
      {warnings.map((warning) => <p key={warning} className="action-error" role="status">{warning}</p>)}
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
