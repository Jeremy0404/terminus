import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServerEventDto } from '@terminus/contracts';

type Listener = (event: ServerEventDto) => void;

interface ServerEvents {
  subscribe(listener: Listener): () => void;
  connected: boolean;
}

const ServerEventsContext = createContext<ServerEvents>({ subscribe: () => () => {}, connected: false });

export function ServerEventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('update', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as ServerEventDto;
      listeners.current.forEach((listener) => listener(event));
    });
    return () => source.close();
  }, []);

  const value: ServerEvents = {
    connected,
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
  };
  return <ServerEventsContext.Provider value={value}>{children}</ServerEventsContext.Provider>;
}

export function useServerEvents(listener: Listener): boolean {
  const events = useContext(ServerEventsContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => events.subscribe((event) => latest.current(event)), [events]);
  return events.connected;
}
