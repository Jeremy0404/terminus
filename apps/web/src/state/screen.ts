import type { AppDto, NetworkDto } from '@terminus/contracts';
import type { Place, View } from './location';

export type Panel = 'settings' | 'memory';

export interface ScreenState {
  readonly founding: boolean;
  readonly adopting: boolean;
  readonly panel: Panel | null;
  readonly current: AppDto | null;
  readonly network: NetworkDto | null;
  readonly place: Place;
  readonly view: View;
}

export type Screen =
  | { readonly kind: 'founding' | 'adopting' | 'settings' | 'empty' }
  | { readonly kind: 'memory'; readonly app: AppDto }
  | { readonly kind: 'deliveries' | 'decisions' | 'active'; readonly network: NetworkDto }
  | { readonly kind: 'network'; readonly network: NetworkDto; readonly mapOnly: boolean }
  | { readonly kind: 'line'; readonly network: NetworkDto; readonly lineId: string }
  | { readonly kind: 'platform'; readonly network: NetworkDto; readonly taskId: string };

export function screenOf({ founding, adopting, panel, current, network, place, view }: ScreenState): Screen {
  if (founding) return { kind: 'founding' };
  if (adopting) return { kind: 'adopting' };
  if (panel === 'settings') return { kind: 'settings' };
  if (panel === 'memory' && current) return { kind: 'memory', app: current };
  if (!network) return { kind: 'empty' };
  if (place.task) return { kind: 'platform', network, taskId: place.task };
  if (view === 'deliveries' || view === 'decisions' || view === 'active') return { kind: view, network };
  if (place.line) return { kind: 'line', network, lineId: place.line };
  return { kind: 'network', network, mapOnly: view === 'map' };
}
