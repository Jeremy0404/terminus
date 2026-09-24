import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerEventsProvider } from './api/events';
import { AppSelector } from './components/AppSelector';
import { Inbox } from './components/Inbox';
import { LineCard } from './components/LineCard';
import { NetworkMap } from './components/NetworkMap';
import { NetworkSummary } from './components/NetworkSummary';
import { Platform } from './components/Platform';
import { Trip } from './components/Trip';
import { levelOf, up, usePlace } from './state/location';
import { useApps, useNetwork } from './state/resources';

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
  const appId = place.app ?? (apps.data ? (apps.data.find((app) => app.id === readLastApp())?.id ?? apps.data[0]?.id ?? null) : null);
  const network = useNetwork(appId);
  const level = levelOf(place);

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
      <header className="top-bar">
        <span className="roundel" aria-hidden="true" />
        <AppSelector apps={apps.data ?? []} current={current} onSelect={(id) => go({ app: id, line: null, task: null })} />
        <span className="spacer" />
        {apps.error && <span className="offline" role="status">{t('app.daemon.offline')}</span>}
      </header>
      {!network.data ? (
        <p className="empty-state" role="status">{apps.data && apps.data.length === 0 ? t('apps.empty') : t('app.loading')}</p>
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
              {level === 'network' && <NetworkSummary network={network.data} />}
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
    </div>
  );
}
