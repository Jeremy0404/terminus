import { useCallback, useEffect, useState } from 'react';

export interface Place {
  readonly app: string | null;
  readonly line: string | null;
  readonly task: string | null;
}

export type Level = 'network' | 'line' | 'platform';

export const VIEWS = ['overview', 'decisions', 'active', 'deliveries', 'map'] as const;
export type View = (typeof VIEWS)[number];

interface Location {
  readonly place: Place;
  readonly view: View | null;
}

export const levelOf = (place: Place): Level => (place.task ? 'platform' : place.line ? 'line' : 'network');

function read(): Location {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  return {
    place: { app: params.get('app'), line: params.get('line'), task: params.get('task') },
    view: VIEWS.find((candidate) => candidate === view) ?? null,
  };
}

function write({ place, view }: Location): void {
  const params = new URLSearchParams();
  if (place.app) params.set('app', place.app);
  if (place.line) params.set('line', place.line);
  if (place.task) params.set('task', place.task);
  if (view) params.set('view', view);
  const query = params.toString();
  window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
}

export function usePlace(): [Place, (next: Place, view?: View) => void, View | null] {
  const [location, setLocation] = useState<Location>(read);
  useEffect(() => {
    const onPop = (): void => setLocation(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next: Place, view?: View) => {
    const location = { place: next, view: view ?? read().view };
    write(location);
    setLocation(location);
  }, []);
  return [location.place, go, location.view];
}

export function up(place: Place): Place {
  if (place.task) return { ...place, task: null };
  if (place.line) return { ...place, line: null };
  return place;
}
