import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { ServerEventsProvider } from '../api/events';
import { detailOf, task } from '../test/fixtures';
import { useTask } from './resources';

type Listener = (event: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private readonly listeners: Record<string, Listener[]> = {};

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }

  close(): void {}

  open(): void {
    (this.listeners['open'] ?? []).forEach((listener) => listener({} as MessageEvent));
  }

  error(): void {
    (this.listeners['error'] ?? []).forEach((listener) => listener({} as MessageEvent));
  }

  send(data: unknown): void {
    (this.listeners['update'] ?? []).forEach((listener) => listener({ data: JSON.stringify(data) } as MessageEvent));
  }
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(ServerEventsProvider, null, children);

let calls: { path: string }[];

beforeEach(() => {
  calls = [];
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^\/api/, '');
      calls.push({ path });
      if (path === '/tasks/t1') return Response.json(detailOf(task('t1', 'ui', 'Zoom', { kind: 'running', runId: 'run-1' }, { phaseIndex: 3 })));
      if (path === '/runs/run-1/transcript') return Response.json([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]);
      if (path === '/runs/run-2/transcript') return Response.json([{ type: 'text', text: 'z' }]);
      return Response.json({ error: `No route ${path}` }, { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('useTask backfill and reconnect', () => {
  it('seeds live.events from the transcript before any SSE message arrives', async () => {
    const { result } = renderHook(() => useTask('t1'), { wrapper });

    await waitFor(() => expect(result.current.live).toEqual([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]));
  });

  it('appends a run-event/check-result SSE message on top of the backfilled events', async () => {
    const { result } = renderHook(() => useTask('t1'), { wrapper });
    await waitFor(() => expect(result.current.live).toHaveLength(2));

    FakeEventSource.instances[0]?.send({ type: 'run-event', runId: 'run-1', taskId: 't1', event: { type: 'text', text: 'c' } });

    await waitFor(() => expect(result.current.live).toEqual([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }, { type: 'text', text: 'c' }]));
  });

  it('appends check-started/check-output SSE messages too', async () => {
    const { result } = renderHook(() => useTask('t1'), { wrapper });
    await waitFor(() => expect(result.current.live).toHaveLength(2));

    FakeEventSource.instances[0]?.send({ type: 'check-started', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test' });
    FakeEventSource.instances[0]?.send({ type: 'check-output', runId: 'run-1', taskId: 't1', name: 'test', command: 'pnpm test', outputTail: 'partial' });

    await waitFor(() =>
      expect(result.current.live).toEqual([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
        { type: 'check-started', name: 'test', command: 'pnpm test' },
        { type: 'check-output', name: 'test', command: 'pnpm test', outputTail: 'partial' },
      ]),
    );
  });

  it('re-fetches the transcript when the SSE connection goes from disconnected to connected', async () => {
    const { result } = renderHook(() => useTask('t1'), { wrapper });
    await waitFor(() => expect(result.current.live).toHaveLength(2));
    const fetchesBeforeReconnect = calls.filter((call) => call.path === '/runs/run-1/transcript').length;

    FakeEventSource.instances[0]?.open();

    await waitFor(() => expect(calls.filter((call) => call.path === '/runs/run-1/transcript').length).toBeGreaterThan(fetchesBeforeReconnect));
  });

  it('does not mix stale events from a previous run when the active run changes', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useTask(id), { wrapper, initialProps: { id: 't1' } });
    await waitFor(() => expect(result.current.live).toHaveLength(2));

    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^\/api/, '');
      calls.push({ path });
      if (path === '/tasks/t2') return Response.json(detailOf(task('t2', 'ui', 'Zoom 2', { kind: 'running', runId: 'run-2' }, { phaseIndex: 3 })));
      if (path === '/runs/run-2/transcript') return Response.json([{ type: 'text', text: 'z' }]);
      return Response.json({ error: `No route ${path}` }, { status: 404 });
    });
    rerender({ id: 't2' });

    await waitFor(() => expect(result.current.live).toEqual([{ type: 'text', text: 'z' }]));
  });
});
