import { useTranslation } from 'react-i18next';
import type { NextStep as Step } from '../network/next-step';

export function NextStep({ step, onAct }: { step: Step; onAct: () => void }) {
  const { t } = useTranslation();
  const label =
    step.kind === 'open-station'
      ? t('nextStep.open', { title: step.title })
      : step.kind === 'break-down'
        ? t('nextStep.breakDown', { name: step.name })
        : step.kind === 'review-memory'
          ? t('nextStep.reviewMemory', { count: step.count })
          : t('nextStep.createLine');
  return (
    <div className="next-step">
      <span className="eyebrow">{t('nextStep.eyebrow')}</span>
      <button type="button" className="btn primary" onClick={onAct}>
        {label}
      </button>
    </div>
  );
}
