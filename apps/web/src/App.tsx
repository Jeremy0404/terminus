import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerEventsProvider } from './api/events';
import { ActivityBar, Toasts } from './components/ActivityFeedback';
import { AdoptionWizard } from './components/adoption/AdoptionWizard';
import { AppSelector } from './components/AppSelector';
import { Inbox } from './components/Inbox';
import { LineCard } from './components/LineCard';
import { NetworkMap } from './components/NetworkMap';
import { NetworkSummary } from './components/NetworkSummary';
import { Platform } from './components/Platform';
import { QuotaGauge } from './components/QuotaGauge';
import { AgentSettings } from './components/settings/AgentSettings';
import { Trip } from './components/Trip';
import { levelOf, up, usePlace } from './state/location';
import { useInboxNotifications } from './state/notifications';
import { useApps, useNetwork, useQuota } from './state/resources';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appId = place.app ?? (apps.data ? (apps.data.find((app) => app.id === readLastApp())?.id ?? apps.data[0]?.id ?? null) : null);
  const network = useNetwork(appId);
  const quota = useQuota();
  const level = levelOf(place);
  const describe = useCallback((title: string, reason: string) => ({ title: t(`notify.${reason}`), body: title }), [t]);
  const notifications = useInboxNotifications(network.data, describe);

  useEffect(() => {
    if (appId) rememberApp(appId);
  }, [appId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape' && !['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '')) go(up({ ...place, app: appId }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, appId, go]);

  const openStation = (line: string, task: string): void => go({ app: appId, line, task });
  const current = apps.data?.find((app) => app.id === appId) ?? null;

  return (
    <div className="shell">
      <ActivityBar />
      <header className="top-bar">
        <span className="roundel" aria-hidden="true" />
        <AppSelector apps={apps.data ?? []} current={current} onSelect={(id) => go({ app: id, line: null, task: null })} onAdopt={() => setAdopting(true)} />
        <span className="spacer" />
        <QuotaGauge quota={quota} />
        <button type="button" className="btn small" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>
          {t('settings.open')}
        </button>
        {notifications.permission === 'default' && (
          <button type="button" className="btn small" onClick={notifications.ask}>{t('notify.enable')}</button>
        )}
        {apps.error && <span className="offline" role="status">{t('app.daemon.offline')}</span>}
      </header>
      {adopting ? (
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
      ) : settingsOpen ? (
        <div className="adoption-stage">
          <AgentSettings onClose={() => setSettingsOpen(false)} />
        </div>
      ) : !network.data ? (
        <div className="empty-state" role="status">
          <p>{apps.data && apps.data.length === 0 ? t('apps.empty') : t('app.loading')}</p>
          {apps.data && apps.data.length === 0 && <button type="button" className="btn primary" onClick={() => setAdopting(true)}>{t('adopt.open')}</button>}
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
              {level === 'network' && <NetworkSummary network={network.data} onStation={openStation} onLine={(line) => go({ app: appId, line, task: null })} />}
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
