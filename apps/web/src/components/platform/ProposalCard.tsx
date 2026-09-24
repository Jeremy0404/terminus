import { useTranslation } from 'react-i18next';
import type { ProposalDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

interface Props {
  readonly decisionId: string;
  readonly reason: string;
  readonly proposal: ProposalDto;
}

export function ProposalCard({ decisionId, reason, proposal }: Props) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const title =
    proposal.kind === 'close'
      ? t('proposal.close', { reason: t(`closeTask.reason.${proposal.reason}`) })
      : proposal.kind === 'split'
        ? t('proposal.split', { count: proposal.stations.length })
        : t('proposal.lighten');

  return (
    <div className="action-card proposal">
      <span className="eyebrow">{t('proposal.eyebrow')}</span>
      <h3>{title}</h3>
      <p className="muted">{reason}</p>
      {proposal.kind === 'close' && proposal.evidence && <p className="evidence">{proposal.evidence}</p>}
      {proposal.kind === 'split' && (
        <ol className="proposed-stations">
          {proposal.stations.map((station) => (
            <li key={station.title}>
              <b>{station.title}</b>
              <span>{station.why}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => api.answer(decisionId, { kind: 'option', index: 0 }))}>
          {t(`proposal.accept.${proposal.kind}`)}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.answer(decisionId, { kind: 'option', index: 1 }))}>
          {t('proposal.continue')}
        </button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
