import { useTranslation } from 'react-i18next';

interface Props {
  readonly noApps: boolean;
  readonly onFound: () => void;
  readonly onAdopt: () => void;
}

export function EmptyState({ noApps, onFound, onAdopt }: Props) {
  const { t } = useTranslation();
  return (
    <div className="empty-state" role="status">
      <p>{noApps ? t('apps.empty') : t('app.loading')}</p>
      {noApps && (
        <div className="row">
          <button type="button" className="btn primary" onClick={onFound}>{t('found.open')}</button>
          <button type="button" className="btn" onClick={onAdopt}>{t('adopt.open')}</button>
        </div>
      )}
    </div>
  );
}
