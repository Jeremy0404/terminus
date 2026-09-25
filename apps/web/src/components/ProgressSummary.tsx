import { useTranslation } from 'react-i18next';
import type { TaskSummaryDto } from '@terminus/contracts';
import { OUTCOMES, progressOf } from '../network/progress';

export function ProgressSummary({ tasks }: { readonly tasks: readonly TaskSummaryDto[] }) {
  const { t } = useTranslation();
  const counts = progressOf(tasks);
  return (
    <div className="progress-summary">
      <p className="progress-total">{t('progress.total', { complete: counts.integrated + counts.existing, total: tasks.length })}</p>
      <div className="outcome-bar" aria-hidden="true">
        {OUTCOMES.filter((kind) => counts[kind] > 0).map((kind) => <span key={kind} className={`outcome-${kind}`} style={{ flex: counts[kind] }} />)}
      </div>
      <dl className="outcome-counts">
        {OUTCOMES.filter((kind) => counts[kind] > 0 || kind === 'integrated' || kind === 'todo').map((kind) => (
          <div key={kind}><dt><i className={`outcome-${kind}`} aria-hidden="true" />{t(`progress.${kind}`)}</dt><dd>{counts[kind]}</dd></div>
        ))}
      </dl>
      <p className="muted small">{t('progress.productionHint')}</p>
    </div>
  );
}
