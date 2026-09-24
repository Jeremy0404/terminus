import { useTranslation } from 'react-i18next';
import type { TaskStatusDto } from '@terminus/contracts';
import { statusKey, toneOf } from '../network/tone';

export function StatusPill({ status }: { status: TaskStatusDto }) {
  const { t } = useTranslation();
  return <span className={`pill tone-${toneOf(status)}`}>{t(statusKey(status))}</span>;
}
