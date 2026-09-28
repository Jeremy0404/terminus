import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { NetworkDto } from '@terminus/contracts';
import { useTranslation } from 'react-i18next';
import { ServerEventsProvider } from './api/events';
import { ActivityBar, Toasts } from './components/ActivityFeedback';
import { AdoptionScreen } from './components/AdoptionScreen';
import { EmptyState } from './components/EmptyState';
import { FoundingScreen } from './components/FoundingScreen';
import { PanelScreen } from './components/PanelScreen';
import { PlatformScreen } from './components/PlatformScreen';
import { appPhaseOf } from './network/app-phase';
import { AppMenu } from './components/AppMenu';
import { LineCard } from './components/LineCard';
import { MapStage, Rail } from './components/MapStage';
import { Trip } from './components/Trip';
import { NetworkRail } from './components/NetworkRail';
import { QuotaGauge } from './components/QuotaGauge';
import { AgentSettings } from './components/settings/AgentSettings';
import { ProjectMemory } from './components/memory/ProjectMemory';
import { up, usePlace } from './state/location';
import { useResume } from './state/journey';
import { screenOf, type Panel } from './state/screen';
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
  const [adopting, setAdopting] = useState(false);
  const [founding, setFounding] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const appId = place.app ?? (apps.data ? (apps.data.find((app) => app.id === readLastApp())?.id ?? apps.data[0]?.id ?? null) : null);
  const network = useNetwork(appId);
  const quota = useQuota();
  const staleSkills = useStaleSkills();
  const describe = useCallback((title: string, reason: string) => ({ title: t(`notify.${reason}`), body: title }), [t]);
  const notifications = useInboxNotifications(network.data, describe);
  const resume = useResume(network.data, place.task);

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
  const openLine = (line: string): void => go({ app: appId, line, task: null });
  const arrive = (id: string): void => {
    apps.reload();
    go({ app: id, line: null, task: null });
  };
  const current = apps.data?.find((app) => app.id === appId) ?? null;
  const screen = screenOf({ founding, adopting, panel, current, network: network.data, place });

  const here = { ...place, app: appId };
  const closePanel = (): void => setPanel(null);
  const openMemory = (): void => setPanel('memory');
  const journey = (loaded: NetworkDto, content: ReactNode): ReactNode => (
    <>
      {screen.kind !== 'platform' && <Trip network={loaded} place={here} go={go} />}
      {content}
    </>
  );
  const mapLevel = (loaded: NetworkDto, rail: ReactNode, station?: ReactNode): ReactNode =>
    journey(loaded, <MapStage network={loaded} place={place} appId={appId} go={go} onStation={openStation} rail={rail} station={station} />);

  const screenContent = (): ReactNode => {
    switch (screen.kind) {
      case 'founding':
        return (
          <FoundingScreen
            onCancel={() => setFounding(false)}
            onFounded={(id) => {
              setFounding(false);
              arrive(id);
            }}
          />
        );
      case 'adopting':
        return (
          <AdoptionScreen
            onCancel={() => setAdopting(false)}
            onAdopted={(id) => {
              setAdopting(false);
              arrive(id);
            }}
          />
        );
      case 'settings':
        return (
          <PanelScreen network={network.data} place={here} go={go} label={t('settings.open')} onClose={closePanel}>
            <AgentSettings
              onClose={closePanel}
              onOpenStation={(app, line, task) => {
                setPanel(null);
                go({ app, line, task });
              }}
            />
          </PanelScreen>
        );
      case 'memory':
        return (
          <PanelScreen network={network.data} place={here} go={go} label={t('memory.open')} onClose={closePanel}>
            <ProjectMemory key={screen.app.id} app={screen.app} onClose={closePanel} />
          </PanelScreen>
        );
      case 'empty':
        return <EmptyState noApps={apps.data?.length === 0} onFound={() => setFounding(true)} onAdopt={() => setAdopting(true)} />;
      case 'network':
        return mapLevel(screen.network, <NetworkRail network={screen.network} resume={resume} onLine={openLine} onStation={openStation} onMemory={openMemory} />);
      case 'line':
        return mapLevel(screen.network, (
          <Rail network={screen.network} lineId={screen.lineId} onOpen={openStation} onMemory={openMemory}>
            <LineCard network={screen.network} lineId={screen.lineId} onStation={openStation} />
          </Rail>
        ));
      case 'platform':
        return mapLevel(
          screen.network,
          <Rail network={screen.network} lineId={place.line} onOpen={openStation} onMemory={openMemory} />,
          <PlatformScreen network={screen.network} place={place} appId={appId} taskId={screen.taskId} go={go} />,
        );
    }
  };

  return (
    <div className="shell">
      <ActivityBar />
      <header className="top-bar">
        <span className="roundel" aria-hidden="true" />
        <AppMenu
          apps={apps.data ?? []}
          current={current}
          onSelect={(id) => go({ app: id, line: null, task: null })}
          onAdopt={() => setAdopting(true)}
          onFound={() => setFounding(true)}
          memoryProposals={network.data?.memoryProposals ?? 0}
          staleSkills={staleSkills}
          canNotify={notifications.permission === 'default'}
          onMemory={openMemory}
          onSettings={() => setPanel('settings')}
          onNotify={notifications.ask}
        />
        {network.data && appPhaseOf(network.data) && <span className="app-phase">{t(`appPhase.${appPhaseOf(network.data)}`)}</span>}
        <span className="spacer" />
        <QuotaGauge quota={quota} />
        {apps.error && <span className="offline" role="status">{t('app.daemon.offline')}</span>}
      </header>
      {screenContent()}
      <Toasts />
    </div>
  );
}
