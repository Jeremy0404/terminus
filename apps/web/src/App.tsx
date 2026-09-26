import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { NetworkDto } from '@terminus/contracts';
import { useTranslation } from 'react-i18next';
import { ServerEventsProvider } from './api/events';
import { ActiveDepartures } from './components/ActiveDepartures';
import { ActivityBar, Toasts } from './components/ActivityFeedback';
import { AdoptionScreen } from './components/AdoptionScreen';
import { EmptyState } from './components/EmptyState';
import { FoundingScreen } from './components/FoundingScreen';
import { JourneyFrame } from './components/JourneyFrame';
import { PanelScreen } from './components/PanelScreen';
import { PlatformScreen } from './components/PlatformScreen';
import { DeliveryCenter } from './components/DeliveryCenter';
import { appPhaseOf } from './network/app-phase';
import { AppSelector } from './components/AppSelector';
import { Inbox } from './components/Inbox';
import { JourneyRecap } from './components/JourneyRecap';
import { LineCard } from './components/LineCard';
import { MapStage, Rail } from './components/MapStage';
import { NetworkRail } from './components/NetworkRail';
import { QuotaGauge } from './components/QuotaGauge';
import { AgentSettings } from './components/settings/AgentSettings';
import { ProjectMemory } from './components/memory/ProjectMemory';
import { up, usePlace, type View } from './state/location';
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
  const [place, go, chosenView] = usePlace();
  const [defaultView] = useState<View>(() => window.matchMedia?.('(max-width: 640px)').matches ? 'decisions' : 'overview');
  const view = chosenView ?? defaultView;
  const [adopting, setAdopting] = useState(false);
  const [founding, setFounding] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const appId = place.app ?? (apps.data ? (apps.data.find((app) => app.id === readLastApp())?.id ?? apps.data[0]?.id ?? null) : null);
  const network = useNetwork(appId);
  const quota = useQuota();
  const staleSkills = useStaleSkills();
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
  const openLine = (line: string): void => go({ app: appId, line, task: null });
  const arrive = (id: string): void => {
    apps.reload();
    go({ app: id, line: null, task: null });
  };
  const current = apps.data?.find((app) => app.id === appId) ?? null;
  const screen = screenOf({ founding, adopting, panel, current, network: network.data, place, view });

  const here = { ...place, app: appId };
  const closePanel = (): void => setPanel(null);
  const openMemory = (): void => setPanel('memory');
  const journey = (loaded: NetworkDto, content: ReactNode): ReactNode => (
    <JourneyFrame network={loaded} place={here} view={view} go={go}>
      {content}
    </JourneyFrame>
  );

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
      case 'deliveries':
        return journey(screen.network, <DeliveryCenter network={screen.network} onOpen={openStation} onMemory={openMemory} />);
      case 'decisions':
        return journey(screen.network, <main className="pocket-content"><Inbox network={screen.network} lineId={null} onOpen={openStation} onMemory={openMemory} /></main>);
      case 'active':
        return journey(screen.network, <ActiveDepartures network={screen.network} onOpen={openStation} />);
      case 'network':
        return journey(screen.network, (
          <MapStage
            network={screen.network}
            place={place}
            appId={appId}
            go={go}
            onStation={openStation}
            rail={screen.mapOnly ? null : (
              <Rail network={screen.network} lineId={null} onOpen={openStation} onMemory={openMemory}>
                <NetworkRail network={screen.network} onLine={openLine} onStation={openStation} onMemory={openMemory} />
              </Rail>
            )}
          />
        ));
      case 'line':
        return journey(screen.network, (
          <MapStage
            network={screen.network}
            place={place}
            appId={appId}
            go={go}
            onStation={openStation}
            rail={(
              <Rail network={screen.network} lineId={screen.lineId} onOpen={openStation} onMemory={openMemory}>
                <LineCard network={screen.network} lineId={screen.lineId} onStation={openStation} />
              </Rail>
            )}
          />
        ));
      case 'platform':
        return journey(screen.network, <PlatformScreen network={screen.network} place={place} appId={appId} taskId={screen.taskId} go={go} onStation={openStation} onMemory={openMemory} />);
    }
  };

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
      {network.data && <JourneyRecap key={network.data.app.id} network={network.data} taskId={place.task} hidden={founding || adopting || panel !== null} onOpen={openStation} />}
      {screenContent()}
      <Toasts />
    </div>
  );
}
