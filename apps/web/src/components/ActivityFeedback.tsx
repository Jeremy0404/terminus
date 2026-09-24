import { useTranslation } from 'react-i18next';
import { useActivity } from '../state/activity';

export function ActivityBar() {
  const { pending } = useActivity();
  return <div className={`activity-bar ${pending > 0 ? 'active' : ''}`} aria-hidden="true" />;
}

export function Toasts() {
  const { t } = useTranslation();
  const { toasts } = useActivity();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <p key={toast.id} className="toast">
          {t('feedback.done', { action: toast.text })}
        </p>
      ))}
    </div>
  );
}
