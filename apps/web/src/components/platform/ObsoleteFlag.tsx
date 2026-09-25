import { useTranslation } from 'react-i18next';
import type { ObsoleteFlagDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

export function ObsoleteFlag({ flag }: { flag: ObsoleteFlagDto }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  return (
    <div className="obsolete-flag" role="note">
      <span className="eyebrow">{t('obsolete.eyebrow', { task: flag.sourceTitle })}</span>
      {flag.reason && <p className="muted">{flag.reason}</p>}
      <div className="row">
        <button type="button" className="btn small primary" disabled={busy} onClick={() => void run(() => api.acceptProposal(flag.proposalId))}>{t('memory.proposals.close')}</button>
        <button type="button" className="btn small" disabled={busy} onClick={() => void run(() => api.dismissProposal(flag.proposalId))}>{t('memory.proposals.keep')}</button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
