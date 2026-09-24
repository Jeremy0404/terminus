import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentChoiceDto, TaskSummaryDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { AgentChoiceFields, describeChoice } from '../agent/AgentChoiceFields';
import { useAction } from './useAction';

export function AgentPicker({ task }: { task: TaskSummaryDto }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<AgentChoiceDto>(task.agent);
  const action = useAction();
  const finished = task.status.kind === 'done' || task.status.kind === 'closed';
  const label = describeChoice(task.agent, t) ?? t('agent.defaults');

  const change = (next: AgentChoiceDto): void => {
    setChoice(next);
    void action.run(() => api.chooseAgent(task.id, next));
  };

  return (
    <span className="agent-picker">
      <button
        type="button"
        className="track-chip agent-chip"
        aria-expanded={open}
        disabled={finished}
        title={t('agent.chipTitle')}
        onClick={() => {
          setChoice(task.agent);
          setOpen(!open);
        }}
      >
        {label}
      </button>
      {open && (
        <span className="agent-editor">
          <AgentChoiceFields choice={choice} onChange={change} disabled={action.busy} label={task.title} />
          {action.busy && <span className="muted small">{t('agent.saving')}</span>}
          {action.error && <span className="action-error" role="alert">{action.error}</span>}
        </span>
      )}
    </span>
  );
}
