import type { ReactNode } from 'react';
import type { NetworkDto } from '@terminus/contracts';
import { up, type Place } from '../state/location';
import { Inbox } from './Inbox';
import { NetworkExplorer } from './NetworkExplorer';

interface ExplorerProps {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly appId: string | null;
  readonly go: (place: Place) => void;
  readonly onStation: (line: string, task: string) => void;
}

export function PlaceExplorer({ network, place, appId, go, onStation }: ExplorerProps) {
  return (
    <NetworkExplorer
      network={network}
      place={place}
      onLine={(line) => go({ app: appId, line, task: null })}
      onStation={onStation}
      onBackground={() => go(up({ ...place, app: appId }))}
    />
  );
}

interface RailProps {
  readonly network: NetworkDto;
  readonly lineId: string | null;
  readonly onOpen: (line: string, task: string) => void;
  readonly onMemory: () => void;
  readonly children?: ReactNode;
}

export function Rail({ network, lineId, onOpen, onMemory, children }: RailProps) {
  return (
    <aside className="rail">
      {children}
      <Inbox network={network} lineId={lineId} onOpen={onOpen} onMemory={onMemory} />
    </aside>
  );
}

interface MapStageProps extends ExplorerProps {
  readonly rail: ReactNode;
  readonly station?: ReactNode;
}

export function MapStage({ rail, station, ...explorer }: MapStageProps) {
  const open = station !== undefined;
  return (
    <div className={open ? 'stage stage-platform' : 'stage'}>
      <section className={open ? 'map-box station-band' : 'map-box'} inert={open}>
        <PlaceExplorer {...explorer} />
      </section>
      {station}
      {rail}
    </div>
  );
}
