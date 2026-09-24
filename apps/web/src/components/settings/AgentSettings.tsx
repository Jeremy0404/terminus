import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentChoiceDto, AgentPhaseDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { AgentChoiceFields } from '../agent/AgentChoiceFields';
import { useAction } from '../platform/useAction';

export function AgentSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [phases, setPhases] = useState<readonly AgentPhaseDto[] | null>(null);
  const [saved, setSaved] = useState(false);
  const load = useAction();
  const save = useAction();

  useEffect(() => {
    void load.run(async () => setPhases(await api.agentSettings()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (key: string, choice: AgentChoiceDto): void => {
    setSaved(false);
    setPhases((current) => current?.map((phase) => (phase.key === key ? { ...phase, choice } : phase)) ?? null);
  };

  const submit = (): void => {
    if (!phases) return;
    void save.run(async () => {
      setPhases(await api.saveAgentSettings(Object.fromEntries(phases.map((phase) => [phase.key, phase.choice]))));
      setSaved(true);
    });
  };

  return (
    <section className="card settings" aria-labelledby="settings-title">
      <div className="platform-head">
        <div>
          <span className="eyebrow">{t('settings.eyebrow')}</span>
          <h2 id="settings-title">{t('settings.agents.title')}</h2>
          <p className="muted">{t('settings.agents.hint')}</p>
        </div>
        <button type="button" className="btn small" onClick={onClose} aria-label={t('settings.close')}>✕</button>
      </div>
      {load.error && <p className="action-error" role="alert">{load.error}</p>}
      {phases && (
        <ul className="settings-rows">
          {phases.map((phase) => {
            const label = t(`settings.phases.${phase.key}`, { defaultValue: phase.key });
            return (
              <li key={phase.key}>
                <span>{label}</span>
                <AgentChoiceFields choice={phase.choice} onChange={(choice) => change(phase.key, choice)} disabled={save.busy} label={label} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={submit} disabled={!phases || save.busy} aria-busy={save.busy}>
          {save.busy ? t('settings.saving') : t('settings.save')}
        </button>
        {saved && !save.busy && <span className="tag good" role="status">{t('settings.saved')}</span>}
        {save.error && <p className="action-error" role="alert">{save.error}</p>}
      </div>
    </section>
  );
}
