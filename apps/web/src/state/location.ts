import { useCallback, useEffect, useState } from 'react';

export interface Place {
  readonly app: string | null;
  readonly line: string | null;
  readonly task: string | null;
}

export type Level = 'network' | 'line' | 'platform';

export const levelOf = (place: Place): Level => (place.task ? 'platform' : place.line ? 'line' : 'network');

function read(): Place {
  const params = new URLSearchParams(window.location.search);
  return { app: params.get('app'), line: params.get('line'), task: params.get('task') };
}

function write(place: Place): void {
  const params = new URLSearchParams();
  if (place.app) params.set('app', place.app);
  if (place.line) params.set('line', place.line);
  if (place.task) params.set('task', place.task);
  const query = params.toString();
  window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
}

export function usePlace(): [Place, (next: Place) => void] {
  const [place, setPlace] = useState<Place>(read);
  useEffect(() => {
    const onPop = (): void => setPlace(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next: Place) => {
    write(next);
    setPlace(next);
  }, []);
  return [place, go];
}

export function up(place: Place): Place {
  if (place.task) return { ...place, task: null };
  if (place.line) return { ...place, line: null };
  return place;
}
