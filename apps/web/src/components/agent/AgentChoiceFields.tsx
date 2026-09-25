import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { EFFORT_LEVELS, type AgentChoiceDto, type EffortDto } from '@terminus/contracts';

export const MODELS = ['haiku', 'sonnet', 'opus', 'fable'] as const;

interface Props {
  readonly choice: AgentChoiceDto;
  readonly onChange: (choice: AgentChoiceDto) => void;
  readonly disabled?: boolean;
  readonly label: string;
  readonly emptyModel?: string;
  readonly emptyEffort?: string;
}

export function AgentChoiceFields({ choice, onChange, disabled = false, label, emptyModel, emptyEffort }: Props) {
  const { t } = useTranslation();
  const models = choice.model && !(MODELS as readonly string[]).includes(choice.model) ? [...MODELS, choice.model] : MODELS;
  return (
    <span className="agent-fields">
      <select
        aria-label={t('agent.modelOf', { label })}
        value={choice.model ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ ...choice, model: event.target.value || null })}
      >
        <option value="">{emptyModel ?? t('agent.defaultModel')}</option>
        {models.map((model) => (
          <option key={model} value={model}>
            {t(`agent.models.${model}`, { defaultValue: model })}
          </option>
        ))}
      </select>
      <select
        aria-label={t('agent.effortOf', { label })}
        value={choice.effort ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ ...choice, effort: (event.target.value || null) as EffortDto | null })}
      >
        <option value="">{emptyEffort ?? t('agent.defaultEffort')}</option>
        {EFFORT_LEVELS.map((effort) => (
          <option key={effort} value={effort}>
            {t(`agent.efforts.${effort}`)}
          </option>
        ))}
      </select>
    </span>
  );
}

export function describeChoice(choice: AgentChoiceDto | null, t: TFunction): string | null {
  if (!choice || (!choice.model && !choice.effort)) return null;
  return [choice.model ? t(`agent.models.${choice.model}`, { defaultValue: choice.model }) : null, choice.effort ? t(`agent.efforts.${choice.effort}`) : null]
    .filter(Boolean)
    .join(' · ');
}
