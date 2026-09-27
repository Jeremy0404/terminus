import type { AppDto, NetworkDto } from '@terminus/contracts';
import type { Place } from './location';

export type Panel = 'settings' | 'memory';

export interface ScreenState {
  readonly founding: boolean;
  readonly adopting: boolean;
  readonly panel: Panel | null;
  readonly current: AppDto | null;
  readonly network: NetworkDto | null;
  readonly place: Place;
}

export type Screen =
  | { readonly kind: 'founding' | 'adopting' | 'settings' | 'empty' }
  | { readonly kind: 'memory'; readonly app: AppDto }
  | { readonly kind: 'network'; readonly network: NetworkDto }
  | { readonly kind: 'line'; readonly network: NetworkDto; readonly lineId: string }
  | { readonly kind: 'platform'; readonly network: NetworkDto; readonly taskId: string };

export function screenOf({ founding, adopting, panel, current, network, place }: ScreenState): Screen {
  if (founding) return { kind: 'founding' };
  if (adopting) return { kind: 'adopting' };
  if (panel === 'settings') return { kind: 'settings' };
  if (panel === 'memory' && current) return { kind: 'memory', app: current };
  if (!network) return { kind: 'empty' };
  if (place.task) return { kind: 'platform', network, taskId: place.task };
  if (place.line) return { kind: 'line', network, lineId: place.line };
  return { kind: 'network', network };
}
