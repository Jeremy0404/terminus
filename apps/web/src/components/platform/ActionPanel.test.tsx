import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDetailDto } from '@terminus/contracts';
import { detailOf, task } from '../../test/fixtures';
import { ActionPanel } from './ActionPanel';

let calls: { method: string; path: string; body: unknown }[];
let reply: (path: string) => Response;

beforeEach(() => {
  calls = [];
  reply = () => Response.json({});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return reply(path);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const grilling: TaskDetailDto = {
  ...detailOf(task('t1', 'ui', 'Zoom', { kind: 'awaiting-decision', decisionId: 'd1' }, { phaseIndex: 1 })),
  decisions: [
    {
      id: 'd1',
      phaseIndex: 1,
      question: 'Où vivent les phases ?',
      options: [
        { label: 'SQLite', description: 'Éditable dans l’app', recommended: false },
        { label: 'YAML', description: 'Versionné avec les skills', recommended: true },
      ],
      answer: null,
    },
  ],
};

describe('ActionPanel', () => {
  it('pre-selects the recommended option and sends it', async () => {
    render(<ActionPanel detail={grilling} live={[]} />);

    expect(screen.getByRole('radio', { name: /YAML/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Recommandé')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider la décision' }));

    await waitFor(() => expect(calls).toEqual([{ method: 'POST', path: '/api/decisions/d1/answer', body: { kind: 'option', index: 1 } }]));
  });

  it('sends a free answer instead when one is typed', async () => {
    render(<ActionPanel detail={grilling} live={[]} />);
    fireEvent.change(screen.getByLabelText('Autre réponse'), { target: { value: 'Les deux' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider la décision' }));

    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'other', text: 'Les deux' }));
  });

  const blocked: TaskDetailDto = {
    ...detailOf(task('t2', 'ui', 'Zoom', { kind: 'blocked', failure: { kind: 'loop-detected', signature: 'zoom.spec.ts', message: 'Same failure 3 times in a row', at: 'x' } }, { phaseIndex: 3 })),
    checkpoints: [{ sequence: 1, phaseIndex: 0, ref: 'refs/terminus/checkpoints/t2/1', takenAt: 'x' }],
    actions: [
      { kind: 'recover', option: 'restart-from-checkpoint', isDefault: true },
      { kind: 'recover', option: 'resume-session', isDefault: false },
      { kind: 'recover', option: 'rewind', isDefault: false },
      { kind: 'recover', option: 'take-over', isDefault: false },
      { kind: 'split-task' },
    ],
  };

  it('explains a blocked run and applies the default recovery', async () => {
    render(<ActionPanel detail={blocked} live={[]} />);

    expect(screen.getByText('L’agent tourne en rond')).toBeInTheDocument();
    expect(screen.getByText('Same failure 3 times in a row')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Repartir du checkpoint/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(calls[0]).toEqual({ method: 'POST', path: '/api/tasks/t2/recover', body: { option: 'restart-from-checkpoint' } }));
  });

  it('rewinds to the chosen checkpoint', async () => {
    render(<ActionPanel detail={blocked} live={[]} />);
    fireEvent.click(screen.getByRole('radio', { name: /Revenir en arrière/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(calls[0]?.body).toEqual({ option: 'rewind', rewindTo: 1 }));
  });

  it('shows the terminal command when taking over', async () => {
    reply = () => Response.json({ task: blocked.task, command: 'cd /wt/t2 && claude --resume abc' });
    render(<ActionPanel detail={blocked} live={[]} />);
    fireEvent.click(screen.getByRole('radio', { name: /Reprendre la main/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(await screen.findByText('cd /wt/t2 && claude --resume abc')).toBeInTheDocument();
  });

  it('shows why a merge is refused', async () => {
    reply = () => Response.json({ error: 'CI on pull request #42 is pending' }, { status: 409 });
    const atMerge: TaskDetailDto = {
      ...detailOf(task('t3', 'ui', 'Zoom', { kind: 'awaiting-gate', gate: 'merge' }, { phaseIndex: 6 })),
      runs: [{ id: 'r', phaseIndex: 6, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, output: { pullRequest: { number: 42, url: 'https://github.com/o/r/pull/42' } } }],
    };
    render(<ActionPanel detail={atMerge} live={[]} />);

    expect(screen.getByRole('link', { name: 'Pull request #42' })).toHaveAttribute('href', 'https://github.com/o/r/pull/42');
    fireEvent.click(screen.getByRole('button', { name: 'Merger' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('CI on pull request #42 is pending');
  });

  it('shows the reviewer verdict and can send the task back to execution', async () => {
    const atReview: TaskDetailDto = {
      ...detailOf(task('t4', 'ui', 'Zoom', { kind: 'awaiting-gate', gate: 'human-review' }, { phaseIndex: 5 })),
      runs: [{ id: 'r', phaseIndex: 5, status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null,
        output: { verdict: 'changes-requested', summary: 'Un manque', findings: [{ severity: 'major', file: 'zoom.ts', summary: 'Pas de test pour Échap' }] } }],
    };
    render(<ActionPanel detail={atReview} live={[]} />);

    expect(screen.getByText('Changements demandés')).toBeInTheDocument();
    expect(screen.getByText('Pas de test pour Échap')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer' }));

    await waitFor(() => expect(calls[0]).toEqual({ method: 'POST', path: '/api/tasks/t4/send-back', body: { toPhaseId: 'execute' } }));
  });

  it('streams the live run and lets the human interrupt it', async () => {
    const running = detailOf(task('t5', 'ui', 'Zoom', { kind: 'running', runId: 'r1' }, { phaseIndex: 3 }));
    render(<ActionPanel detail={running} live={[{ type: 'text', text: 'Écrit le test rouge' }, { type: 'tool-failure', tool: 'Bash', signature: 's', summary: 'pnpm test' }]} />);

    expect(screen.getByText('Écrit le test rouge')).toBeInTheDocument();
    expect(screen.getByText('✗ Bash pnpm test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Interrompre' }));

    await waitFor(() => expect(calls[0]).toEqual({ method: 'POST', path: '/api/tasks/t5/interrupt', body: undefined }));
  });
});
