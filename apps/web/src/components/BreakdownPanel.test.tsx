import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EpicDto } from '@terminus/contracts';
import { BreakdownPanel } from './BreakdownPanel';
import { NewLineForm } from './NewLineForm';
import { NETWORK } from '../test/fixtures';

let calls: { path: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({ id: 'epic-9' }, { status: 201 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const epic = (breakdown: EpicDto['breakdown'], description = ''): EpicDto => ({ id: 'e1', appId: 'app-1', code: 'A', name: 'Adoption', status: 'active', position: 3, description, breakdown });

describe('BreakdownPanel', () => {
  it('starts a breakdown from the epic description', async () => {
    render(<BreakdownPanel epic={epic({ status: 'idle' }, 'Adopt repos')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Découper avec l’agent' }));
    expect(screen.getByLabelText('Ce que cette épique doit apporter')).toHaveValue('Adopt repos');
    fireEvent.click(screen.getByRole('button', { name: 'Lancer le découpage' }));
    await waitFor(() => expect(calls).toEqual([{ path: '/api/epics/e1/breakdown', body: { brief: 'Adopt repos' } }]));
  });

  it('shows that the agent is working', () => {
    render(<BreakdownPanel epic={epic({ status: 'running', brief: 'x', runId: 'r' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('L’agent explore le code et découpe l’épique…');
  });

  it('lets the human edit, drop and accept the proposed stations, remapping dependencies', async () => {
    render(
      <BreakdownPanel
        epic={epic({
          status: 'ready',
          brief: 'x',
          proposal: {
            description: 'Adopt a repo',
            stations: [
              { title: 'Scan', why: 'stack', dependsOn: [] },
              { title: 'Import issues', why: 'backlog', dependsOn: [0] },
              { title: 'Cut over', why: 'switch', dependsOn: [0, 1] },
            ],
          },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Titre de la station 1'), { target: { value: 'Scan the repository' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la station 2' }));
    fireEvent.click(screen.getByLabelText('Parcours léger · sans grill ni plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer 2 stations' }));

    await waitFor(() =>
      expect(calls).toEqual([
        {
          path: '/api/epics/e1/breakdown/accept',
          body: { description: 'Adopt a repo', stations: [{ title: 'Scan the repository', dependsOn: [] }, { title: 'Cut over', dependsOn: [0] }], track: 'light' },
        },
      ]),
    );
  });

  it('reports a failed breakdown', () => {
    render(<BreakdownPanel epic={epic({ status: 'failed', brief: 'x', error: 'quota' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Le découpage a échoué : quota');
  });
});

describe('NewLineForm with a goal', () => {
  it('creates the line with its goal and starts the breakdown at once', async () => {
    render(<NewLineForm network={NETWORK} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText('Nom de l’épique'), { target: { value: 'Adoption' } });
    fireEvent.change(screen.getByLabelText('Objectif'), { target: { value: 'Adopt existing repos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tracer la ligne' }));

    await waitFor(() => expect(calls.map((call) => call.path)).toEqual(['/api/apps/app-1/epics', '/api/epics/epic-9/breakdown']));
    expect(calls[0]?.body).toMatchObject({ name: 'Adoption', description: 'Adopt existing repos' });
    expect(calls[1]?.body).toEqual({ brief: 'Adopt existing repos' });
  });
});
