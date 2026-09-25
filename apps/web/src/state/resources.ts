import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppDto, NetworkDto, QuotaDto, ServerEventDto, TaskDetailDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useServerEvents } from '../api/events';

const REFRESH_DEBOUNCE_MS = 120;

export interface Resource<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly reload: () => void;
}

interface Loaded<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: Error | null;
}

function useResource<T>(load: (() => Promise<T>) | null, key: string): Resource<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: '', data: null, error: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setLoaded({ key, data, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoaded((previous) => ({ ...previous, key, error: cause instanceof Error ? cause : new Error(String(cause)) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const current = load !== null && loaded.key === key;
  return { data: current ? loaded.data : null, error: current ? loaded.error : null, reload };
}

function useDebounced(callback: () => void): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(callback, REFRESH_DEBOUNCE_MS);
  }, [callback]);
}

export function useApps(): Resource<AppDto[]> {
  return useResource(api.apps, 'apps');
}

export function useNetwork(appId: string | null): Resource<NetworkDto> {
  const resource = useResource(appId ? () => api.network(appId) : null, `network:${appId}`);
  const refresh = useDebounced(resource.reload);
  useServerEvents((event) => {
    if (event.type === 'task-changed' || event.type === 'epic-changed' || event.type === 'memory-changed') refresh();
  });
  return resource;
}

export function useQuota(): QuotaDto | null {
  const loaded = useResource(api.quota, 'quota');
  const [pushed, setPushed] = useState<QuotaDto | null>(null);
  useServerEvents((event) => {
    if (event.type === 'quota-changed') setPushed(event.quota);
  });
  return pushed ?? loaded.data;
}

function liveItem(event: Extract<ServerEventDto, { runId: string; taskId: string }>): unknown {
  switch (event.type) {
    case 'run-event':
      return event.event;
    case 'check-result':
      return event.result;
    case 'check-started':
      return { type: 'check-started', name: event.name, command: event.command };
    case 'check-output':
      return { type: 'check-output', name: event.name, command: event.command, outputTail: event.outputTail };
  }
}

export function useTask(taskId: string | null): Resource<TaskDetailDto> & { readonly live: readonly unknown[] } {
  const resource = useResource(taskId ? () => api.task(taskId) : null, `task:${taskId}`);
  const refresh = useDebounced(resource.reload);
  const [live, setLive] = useState<{ readonly runId: string | null; readonly events: readonly unknown[] }>({ runId: null, events: [] });
  const connected = useServerEvents((event) => {
    if (event.type === 'task-changed' && event.task.id === taskId) refresh();
    if ((event.type === 'run-event' || event.type === 'check-result' || event.type === 'check-started' || event.type === 'check-output') && event.taskId === taskId) {
      const item = liveItem(event);
      setLive((current) => (current.runId === event.runId ? { runId: event.runId, events: [...current.events, item] } : { runId: event.runId, events: [item] }));
    }
  });
  const running = resource.data?.task.status.kind === 'running' ? resource.data.task.status.runId : null;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    api.transcript(running).then((events) => {
      if (!cancelled) setLive({ runId: running, events });
    });
    return () => {
      cancelled = true;
    };
  }, [running]);

  const wasConnected = useRef(connected);
  useEffect(() => {
    const justConnected = connected && !wasConnected.current;
    wasConnected.current = connected;
    if (!justConnected || !running) return;
    let cancelled = false;
    api.transcript(running).then((events) => {
      if (!cancelled) setLive({ runId: running, events });
    });
    return () => {
      cancelled = true;
    };
  }, [connected, running]);

  return { ...resource, live: live.runId !== null && live.runId === running ? live.events : [] };
}
