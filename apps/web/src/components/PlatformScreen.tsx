import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import type { Place } from '../state/location';
import { PlaceExplorer, Rail } from './MapStage';
import { Platform } from './Platform';

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly appId: string | null;
  readonly taskId: string;
  readonly go: (place: Place) => void;
  readonly onStation: (line: string, task: string) => void;
  readonly onMemory: () => void;
}

export function PlatformScreen({ network, place, appId, taskId, go, onStation, onMemory }: Props) {
  const { t } = useTranslation();
  return (
    <div className="stage stage-platform">
      <main className="workspace">
        <Platform key={taskId} network={network} taskId={taskId} onClose={() => go({ ...place, app: appId, task: null })} />
      </main>
      <details className="map-box workspace-map">
        <summary>{t('platform.map')}</summary>
        <p className="muted small map-hint">{t('platform.mapHint')}</p>
        <PlaceExplorer network={network} place={place} appId={appId} go={go} onStation={onStation} />
      </details>
      <Rail network={network} lineId={place.line} onOpen={onStation} onMemory={onMemory} />
    </div>
  );
}
