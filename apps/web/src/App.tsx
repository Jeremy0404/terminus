import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerEventsProvider } from './api/events';
import { ActivityBar, Toasts } from './components/ActivityFeedback';
import { AdoptionWizard } from './components/adoption/AdoptionWizard';
import { NewAppForm } from './components/NewAppForm';
import { appPhaseOf } from './network/app-phase';
import { AppSelector } from './components/AppSelector';
import { Inbox } from './components/Inbox';
import { LineCard } from './components/LineCard';
import { NetworkMap } from './components/NetworkMap';
import { NetworkSummary } from './components/NetworkSummary';
import { Platform } from './components/Platform';
import { QuotaGauge } from './components/QuotaGauge';
import { AgentSettings } from './components/settings/AgentSettings';
import { ProjectMemory } from './components/memory/ProjectMemory';
import { Trip } from './components/Trip';
import { levelOf, up, usePlace } from './state/location';
import { useInboxNotifications } from './state/notifications';
import { useApps, useNetwork, useQuota, useStaleSkills } from './state/resources';

const LAST_APP_KEY = 'terminus:last-app';

function readLastApp(): string | null {
  try {
    return window.localStorage.getItem(LAST_APP_KEY);
  } catch {
    return null;
  }
}

function rememberApp(appId: string): void {
  try {
    window.localStorage.setItem(LAST_APP_KEY, appId);
  } catch {
    // Browser storage is optional.
  }
}

export function App() {
  return (
    <ServerEventsProvider>
      <Cockpit />
    </ServerEventsProvider>
  );
}

function Cockpit() {
  const { t } = useTranslation();
  const apps = useApps();
  const [place, go] = usePlace();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [founding, setFounding] = useState(false);
  const [panel, setPanel] = useState<'settings' | 'memory' | null>(null);
  const appId = place.app ?? (apps.data ? (apps.data.find((app) => app.id === readLastApp())?.id ?? apps.data[0]?.id ?? null) : null);
  const network = useNetwork(appId);
  const quota = useQuota();
  const staleSkills = useStaleSkills();
  const level = levelOf(place);
  const describe = useCallback((title: string, reason: string) => ({ title: t(`notify.${reason}`), body: title }), [t]);
  const notifications = useInboxNotifications(network.data, describe);

  useEffect(() => {
    if (appId) rememberApp(appId);
  }, [appId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'Escape' || ['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '')) return;
      if (panel) setPanel(null);
      else go(up({ ...place, app: appId }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, appId, go, panel]);

  const openStation = (line: string, task: string): void => go({ app: appId, line, task });
  const current = apps.data?.find((app) => app.id === appId) ?? null;

  return (
    <div className="shell">
      <ActivityBar />
      <header className="top-bar">
        <span className="roundel" aria-hidden="true" />
        <AppSelector apps={apps.data ?? []} current={current} onSelect={(id) => go({ app: id, line: null, task: null })} onAdopt={() => setAdopting(true)} onFound={() => setFounding(true)} />
        {network.data && appPhaseOf(network.data) && <span className="app-phase">{t(`appPhase.${appPhaseOf(network.data)}`)}</span>}
        <span className="spacer" />
        <QuotaGauge quota={quota} />
        {current && (
          <button type="button" className="btn small" aria-pressed={panel === 'memory'} onClick={() => setPanel(panel === 'memory' ? null : 'memory')}>
            {t('memory.open')}
            {(network.data?.memoryProposals ?? 0) > 0 && <span className="badge" aria-label={t('memory.pending', { count: network.data?.memoryProposals })}>{network.data?.memoryProposals}</span>}
          </button>
        )}
        <button type="button" className="btn small" aria-pressed={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
          {t('settings.open')}
          {staleSkills > 0 && <span className="badge" aria-label={t('ritual.pending', { count: staleSkills })}>{staleSkills}</span>}
        </button>
        {notifications.permission === 'default' && (
          <button type="button" className="btn small" onClick={notifications.ask}>{t('notify.enable')}</button>
        )}
        {apps.error && <span className="offline" role="status">{t('app.daemon.offline')}</span>}
      </header>
      {founding ? (
        <div className="adoption-stage">
          <NewAppForm
            onCancel={() => setFounding(false)}
            onFounded={(id) => {
              setFounding(false);
              apps.reload();
              go({ app: id, line: null, task: null });
            }}
          />
        </div>
      ) : adopting ? (
        <div className="adoption-stage">
          <AdoptionWizard
            onCancel={() => setAdopting(false)}
            onAdopted={(id) => {
              setAdopting(false);
              apps.reload();
              go({ app: id, line: null, task: null });
            }}
          />
        </div>
      ) : panel === 'settings' || (panel === 'memory' && current) ? (
        <>
          {network.data && (
            <Trip network={network.data} place={{ ...place, app: appId }} go={go} panel={{ label: t(panel === 'settings' ? 'settings.open' : 'memory.open'), onClose: () => setPanel(null) }} />
          )}
          <div className="adoption-stage">
            {panel === 'settings' ? (
              <AgentSettings
                onClose={() => setPanel(null)}
                onOpenStation={(app, line, task) => {
                  setPanel(null);
                  go({ app, line, task });
                }}
              />
            ) : current && <ProjectMemory key={current.id} app={current} onClose={() => setPanel(null)} />}
          </div>
        </>
      ) : !network.data ? (
        <div className="empty-state" role="status">
          <p>{apps.data && apps.data.length === 0 ? t('apps.empty') : t('app.loading')}</p>
          {apps.data && apps.data.length === 0 && (
            <div className="row">
              <button type="button" className="btn primary" onClick={() => setFounding(true)}>{t('found.open')}</button>
              <button type="button" className="btn" onClick={() => setAdopting(true)}>{t('adopt.open')}</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <Trip network={network.data} place={{ ...place, app: appId }} go={go} />
          <div className="stage">
            <section className="map-box">
              <NetworkMap
                network={network.data}
                place={place}
                onLine={(line) => go({ app: appId, line, task: null })}
                onStation={openStation}
                onBackground={() => go(up({ ...place, app: appId }))}
              />
            </section>
            <aside className="rail">
              {level === 'network' && <NetworkSummary network={network.data} onStation={openStation} onLine={(line) => go({ app: appId, line, task: null })} onMemory={() => setPanel('memory')} />}
              {level === 'line' && place.line && <LineCard network={network.data} lineId={place.line} onStation={openStation} />}
              {level === 'platform' && place.task && (
                <Platform network={network.data} taskId={place.task} onClose={() => go({ ...place, app: appId, task: null })} />
              )}
              <Inbox
                network={network.data}
                lineId={level === 'network' ? null : place.line}
                onOpen={openStation}
                collapsible={level === 'platform'}
                open={level !== 'platform' || inboxOpen}
                onToggle={() => setInboxOpen(!inboxOpen)}
              />
            </aside>
          </div>
        </>
      )}
      <Toasts />
    </div>
  );
}
