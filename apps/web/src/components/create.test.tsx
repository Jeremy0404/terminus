import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { NetworkDto } from '@terminus/contracts';
import { useInboxNotifications } from '../state/notifications';
import { NETWORK } from '../test/fixtures';
import { NewLineForm, suggestCode } from './NewLineForm';
import { NewStationForm } from './NewStationForm';

let calls: { path: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({}, { status: 201 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('suggestCode', () => {
  it('uses the free initial of the name, else the first free letter', () => {
    expect(suggestCode('Adoption', ['M', 'I'])).toBe('A');
    expect(suggestCode('Moteur bis', ['M', 'I'])).toBe('A');
    expect(suggestCode('', ['A'])).toBe('B');
  });
});

describe('NewLineForm', () => {
  it('draws a planned line with the suggested code', async () => {
    const onDone = vi.fn();
    render(<NewLineForm network={NETWORK} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Nom de l’épique'), { target: { value: 'Adoption' } });
    fireEvent.click(screen.getByLabelText('En projet (pas encore commencée)'));
    fireEvent.click(screen.getByRole('button', { name: 'Tracer la ligne' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls).toEqual([{ path: '/api/apps/app-1/epics', body: { code: 'A', name: 'Adoption', status: 'planned', description: '' } }]);
  });

  it('disables its fields and cancel button while the request is in flight', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Promise<Response>((r) => { resolve = r; })),
    );
    const onDone = vi.fn();
    render(<NewLineForm network={NETWORK} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Nom de l’épique'), { target: { value: 'Adoption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tracer la ligne' }));

    await waitFor(() => expect(screen.getByLabelText('Nom de l’épique')).toBeDisabled());
    expect(screen.getByLabelText('Code de ligne')).toBeDisabled();
    expect(screen.getByLabelText('En projet (pas encore commencée)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();

    resolve(Response.json({}, { status: 201 }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.getByLabelText('Nom de l’épique')).not.toBeDisabled();
    expect(screen.getByLabelText('Code de ligne')).not.toBeDisabled();
    expect(screen.getByLabelText('En projet (pas encore commencée)')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).not.toBeDisabled();
  });
});

describe('NewStationForm', () => {
  it('adds a station waiting on unfinished tasks of other lines', async () => {
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);

    expect(screen.queryByLabelText(/Spike CLI/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rendu SVG/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tâche'), { target: { value: 'Notifications' } });
    fireEvent.click(screen.getByLabelText('M · Adaptateur CLI'));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(calls).toEqual([{ path: '/api/epics/ui/tasks', body: { title: 'Notifications', dependsOn: ['m2'], track: 'standard' } }]));
  });

  it('disables its fields and cancel button while the request is in flight', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Promise<Response>((r) => { resolve = r; })),
    );
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Tâche'), { target: { value: 'Notifications' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(screen.getByLabelText('Tâche')).toBeDisabled());
    expect(screen.getByLabelText('M · Adaptateur CLI')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();

    resolve(Response.json({}, { status: 201 }));
    await waitFor(() => expect(screen.getByLabelText('Tâche')).not.toBeDisabled());
    expect(screen.getByLabelText('M · Adaptateur CLI')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).not.toBeDisabled();
  });
});

describe('useInboxNotifications', () => {
  it('notifies only items that appear after the first load, once permission is granted', () => {
    const shown: { title: string; body: string | undefined }[] = [];
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = () => Promise.resolve('granted');
      constructor(title: string, options?: NotificationOptions) {
        shown.push({ title, body: options?.body });
      }
    }
    vi.stubGlobal('Notification', FakeNotification);
    const describe = (title: string, reason: string) => ({ title: reason, body: title });
    const { rerender } = renderHook(({ network }: { network: NetworkDto }) => useInboxNotifications(network, describe), { initialProps: { network: NETWORK } });

    expect(shown).toEqual([]);
    rerender({ network: { ...NETWORK, inbox: [...NETWORK.inbox, { taskId: 'm2', epicId: 'engine', reason: { kind: 'decision', decisionId: 'd9' }, unblocks: 0 }] } });

    expect(shown).toEqual([{ title: 'decision', body: 'Adaptateur CLI' }]);
  });
});
