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
  const DRAFT = { title: 'Add notifications', understanding: 'You want to be told when a station needs you.', summary: 'Notify the human when a station waits.' };
  const TEXT = 'des notifs quand\n  une station m’attend';
  const drafted = (draft: unknown = DRAFT) => () => Promise.resolve(Response.json(draft));
  const failed = (error = 'The agent crashed') => () => Promise.resolve(Response.json({ error }, { status: 409 }));

  function answerDrafts(...answers: (() => Promise<Response>)[]): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (path.endsWith('/station-draft')) return (answers.shift() ?? failed('No draft left'))();
        return Response.json({}, { status: 201 });
      }),
    );
  }

  const typeText = (text = TEXT): void => {
    fireEvent.change(screen.getByLabelText('Ce qu’il faut faire'), { target: { value: text } });
  };

  it('only offers to format the text at first', () => {
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);

    expect(screen.getByRole('button', { name: 'Mettre en forme' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter tel quel' })).not.toBeInTheDocument();
    typeText('   ');
    expect(screen.getByRole('button', { name: 'Mettre en forme' })).toBeDisabled();
    typeText();
    expect(screen.getByRole('button', { name: 'Mettre en forme' })).toBeEnabled();
  });

  it('formats the text, then adds the edited proposal waiting on unfinished tasks of other lines', async () => {
    answerDrafts(drafted());
    const onDone = vi.fn();
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={onDone} />);

    expect(screen.queryByLabelText(/Spike CLI/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rendu SVG/)).not.toBeInTheDocument();
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));

    expect(await screen.findByText(DRAFT.understanding)).toBeInTheDocument();
    expect(calls).toEqual([{ path: '/api/epics/ui/station-draft', body: { text: 'des notifs quand\n  une station m’attend' } }]);
    expect(screen.getByLabelText('Titre')).toHaveValue(DRAFT.title);
    expect(screen.getByLabelText('Résumé')).toHaveValue(DRAFT.summary);
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Notify when a station waits ' } });
    fireEvent.change(screen.getByLabelText('Résumé'), { target: { value: 'Notify the human.\nOnce per station. ' } });
    fireEvent.click(screen.getByLabelText('M · Adaptateur CLI'));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.at(-1)).toEqual({
      path: '/api/epics/ui/tasks',
      body: { title: 'Notify when a station waits', description: 'Notify the human.\nOnce per station.', dependsOn: ['m2'], track: 'standard' },
    });
  });

  it('cannot add a proposal whose title was cleared', async () => {
    answerDrafts(drafted());
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));

    fireEvent.change(await screen.findByLabelText('Titre'), { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  });

  it('drafts again on the edited text and replaces the proposal', async () => {
    answerDrafts(drafted(), drafted({ title: 'Add a notification bell', understanding: 'A bell in the header.', summary: 'Show a bell.' }));
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));
    await screen.findByText(DRAFT.understanding);

    typeText('une cloche de notifs');
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));

    expect(await screen.findByText('A bell in the header.')).toBeInTheDocument();
    expect(screen.queryByText(DRAFT.understanding)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Titre')).toHaveValue('Add a notification bell');
    expect(screen.getByLabelText('Résumé')).toHaveValue('Show a bell.');
    expect(calls.at(-1)).toEqual({ path: '/api/epics/ui/station-draft', body: { text: 'une cloche de notifs' } });
  });

  it('adds the text as typed once formatting failed', async () => {
    answerDrafts(failed());
    const onDone = vi.fn();
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={onDone} />);
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La mise en forme a échoué : The agent crashed');
    expect(screen.getByRole('button', { name: 'Relancer' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter tel quel' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.at(-1)).toEqual({
      path: '/api/epics/ui/tasks',
      body: { title: 'des notifs quand une station m’attend', description: 'des notifs quand\n  une station m’attend', dependsOn: [], track: 'standard' },
    });
  });

  it('goes back to the proposal when a rerun succeeds after a failure', async () => {
    answerDrafts(failed(), drafted());
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Relancer' }));

    expect(await screen.findByText(DRAFT.understanding)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Ajouter tel quel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables its fields and cancel button while the text is being formatted', async () => {
    let resolve!: (response: Response) => void;
    answerDrafts(() => new Promise<Response>((r) => { resolve = r; }));
    render(<NewStationForm network={NETWORK} lineId="ui" onDone={() => {}} />);
    typeText();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en forme' }));

    await waitFor(() => expect(screen.getByLabelText('Ce qu’il faut faire')).toBeDisabled());
    expect(screen.getByLabelText('M · Adaptateur CLI')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();

    resolve(Response.json(DRAFT));
    await waitFor(() => expect(screen.getByLabelText('Ce qu’il faut faire')).not.toBeDisabled());
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
