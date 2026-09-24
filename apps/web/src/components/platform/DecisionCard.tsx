import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecisionDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { useAction } from './useAction';

export function DecisionCard({ decision, position, total }: { decision: DecisionDto; position: number; total: number }) {
  const { t } = useTranslation();
  const recommended = decision.options.findIndex((option) => option.recommended);
  const [choice, setChoice] = useState<number | null>(recommended >= 0 ? recommended : null);
  const [other, setOther] = useState('');
  const { busy, error, run } = useAction();
  const answer = other.trim() ? { kind: 'other' as const, text: other.trim() } : choice === null ? null : { kind: 'option' as const, index: choice };

  return (
    <div className="action-card">
      <span className="eyebrow">{t('decision.eyebrow', { position, total })}</span>
      <h3>{decision.question}</h3>
      <div className="options" role="radiogroup" aria-label={decision.question}>
        {decision.options.map((option, index) => (
          <button key={option.label} type="button" role="radio" aria-checked={choice === index && !other.trim()} className="option"
            onClick={() => {
              setChoice(index);
              setOther('');
            }}>
            <b>
              {option.label}
              {option.recommended && <span className="tag">{t('decision.recommended')}</span>}
            </b>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
      <label className="eyebrow" htmlFor={`other-${decision.id}`}>{t('decision.other')}</label>
      <input id={`other-${decision.id}`} className="free-answer" value={other} onChange={(event) => setOther(event.target.value)} placeholder={t('decision.otherPlaceholder')} />
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || answer === null} onClick={() => answer && void run(() => api.answer(decision.id, answer))}>
          {t('decision.submit')}
        </button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
