import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDetailDto } from '@terminus/contracts';
import { detailOf, task } from '../test/fixtures';
import { NewAppForm } from './NewAppForm';
import { ActionPanel } from './platform/ActionPanel';

let calls: { path: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({ id: 'app-9', name: 'Carnet', repoPath: '/p/carnet' }, { status: 201 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('starting an app from an idea', () => {
  it('founds the app with its idea and opens it', async () => {
    const onFounded = vi.fn();
    render(<NewAppForm onCancel={() => {}} onFounded={onFounded} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Nom' }), { target: { value: 'Carnet' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'L’idée' }), { target: { value: 'Log my rides.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’app et son dépôt' }));

    await waitFor(() => expect(onFounded).toHaveBeenCalledWith('app-9'));
    expect(calls).toEqual([{ path: '/api/apps/found', body: { name: 'Carnet', idea: 'Log my rides.', repoPath: '', visibility: 'private' } }]);
  });

  it('shows the product brief at its approval gate', () => {
    const framing = { ...task('f1', 'engine', 'Cadrer', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 1 }), phases: ['grill', 'brief'], phasesInTrack: ['grill', 'brief'] };
    const detail: TaskDetailDto = {
      ...detailOf(framing),
      runs: [{ id: 'r', phaseIndex: 1, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, agent: null, output: { summary: 'ok', brief: '## Problème\n\nTrop d’onglets.' } }],
    };
    render(<ActionPanel detail={detail} live={[]} />);

    expect(screen.getByText('Brief à valider')).toBeInTheDocument();
    expect(screen.getByText(/Trop d’onglets\./)).toBeInTheDocument();
  });

  it('shows the chosen stack and its decisions at its approval gate', () => {
    const stack = { ...task('s1', 'engine', 'Stack', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 1 }), phases: ['options', 'architecture'], phasesInTrack: ['options', 'architecture'] };
    const detail: TaskDetailDto = {
      ...detailOf(stack),
      runs: [{
        id: 'r', phaseIndex: 1, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, agent: null,
        output: { summary: 'ok', stackId: 'stack-static-site', stackName: 'Site statique', decisions: [{ title: 'Hébergement', decision: 'nginx', why: 'Simple' }], verification: [{ name: 'html', command: 'npx html-validate' }] },
      }],
    };
    render(<ActionPanel detail={detail} live={[]} />);

    expect(screen.getByText('Stack à valider')).toBeInTheDocument();
    expect(screen.getByText('Site statique')).toBeInTheDocument();
    expect(screen.getByText('Hébergement')).toBeInTheDocument();
    expect(screen.getByText('Vérifications de l’app : npx html-validate')).toBeInTheDocument();
  });
});
