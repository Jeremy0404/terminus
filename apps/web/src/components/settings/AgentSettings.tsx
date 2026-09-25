import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentChoiceDto, AgentSettingsDto } from '@terminus/contracts';
import { api } from '../../api/client';
import { AgentChoiceFields } from '../agent/AgentChoiceFields';
import { useAction } from '../platform/useAction';
import { PlaybookRitual } from './PlaybookRitual';

export function AgentSettings({ onClose, onOpenStation }: { onClose: () => void; onOpenStation: (appId: string, lineId: string, taskId: string) => void }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AgentSettingsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAction();

  useEffect(() => {
    let cancelled = false;
    api
      .agentSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const edit = (next: AgentSettingsDto): void => {
    setSaved(false);
    setSettings(next);
  };

  const submit = (): void => {
    if (!settings) return;
    void save.run(async () => {
      setSettings(await api.saveAgentSettings(settings.fallback, Object.fromEntries(settings.phases.map((phase) => [phase.key, phase.choice]))));
      setSaved(true);
    });
  };

  const fallbackLabel = t('settings.fallback');

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
      {loadError && <p className="action-error" role="alert">{loadError}</p>}
      {settings && (
        <ul className="settings-rows">
          <li className="settings-fallback">
            <span>{fallbackLabel}</span>
            <AgentChoiceFields
              choice={settings.fallback}
              onChange={(fallback: AgentChoiceDto) => edit({ ...settings, fallback })}
              disabled={save.busy}
              label={fallbackLabel}
              emptyModel={t('agent.accountModel')}
              emptyEffort={t('agent.accountEffort')}
            />
          </li>
          {settings.phases.map((phase) => {
            const label = t(`settings.phases.${phase.key}`, { defaultValue: phase.key });
            const inheritedModel = phase.inherited.model ? t(`agent.models.${phase.inherited.model}`, { defaultValue: phase.inherited.model }) : t('agent.account');
            const inheritedEffort = phase.inherited.effort ? t(`agent.efforts.${phase.inherited.effort}`) : t('agent.account');
            return (
              <li key={phase.key}>
                <span>{label}</span>
                <AgentChoiceFields
                  choice={phase.choice}
                  onChange={(choice) => edit({ ...settings, phases: settings.phases.map((candidate) => (candidate.key === phase.key ? { ...candidate, choice } : candidate)) })}
                  disabled={save.busy}
                  label={label}
                  emptyModel={t('agent.inherit', { value: inheritedModel })}
                  emptyEffort={t('agent.inherit', { value: inheritedEffort })}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={submit} disabled={!settings || save.busy} aria-busy={save.busy}>
          {save.busy ? t('settings.saving') : t('settings.save')}
        </button>
        {saved && !save.busy && <span className="tag good" role="status">{t('settings.saved')}</span>}
        {save.error && <p className="action-error" role="alert">{save.error}</p>}
      </div>
      <PlaybookRitual onOpenStation={onOpenStation} />
    </section>
  );
}
