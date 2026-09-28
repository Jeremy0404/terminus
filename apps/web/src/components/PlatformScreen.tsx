import type { NetworkDto } from '@terminus/contracts';
import type { Place } from '../state/location';
import { Platform } from './Platform';

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly appId: string | null;
  readonly taskId: string;
  readonly go: (place: Place) => void;
}

export function PlatformScreen({ network, place, appId, taskId, go }: Props) {
  return (
    <main className="workspace">
      <Platform key={taskId} network={network} taskId={taskId} onClose={() => go({ ...place, app: appId, task: null })} />
    </main>
  );
}
