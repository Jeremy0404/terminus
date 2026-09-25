import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDetailDto } from '@terminus/contracts';
import { detailOf, task } from '../../test/fixtures';
import { ActionPanel } from './ActionPanel';

let calls: { path: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const proposing = (proposal: NonNullable<TaskDetailDto['decisions'][number]['proposal']>): TaskDetailDto => ({
  ...detailOf(task('t1', 'ui', 'Zoom', { kind: 'awaiting-decision', decisionId: 'p1' }, { phaseIndex: 1 })),
  decisions: [
    {
      id: 'p1', kind: 'proposal', proposal, phaseIndex: 1, question: 'The sync phase already does this.', answer: null,
      options: [{ label: 'Accept the proposal', description: '', recommended: true }, { label: 'Continue as planned', description: '', recommended: false }],
    },
  ],
});

describe('a proposal from the spec agent', () => {
  it('offers to close with the evidence, and sends the acceptance', async () => {
    render(<ActionPanel detail={proposing({ kind: 'close', reason: 'already-done', evidence: 'PR #26' })} live={[]} />);

    expect(screen.getByText('Clôturer : Déjà réalisée')).toBeInTheDocument();
    expect(screen.getByText('The sync phase already does this.')).toBeInTheDocument();
    expect(screen.getByText('PR #26')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la tâche' }));

    await waitFor(() => expect(calls).toEqual([{ path: '/api/decisions/p1/answer', body: { kind: 'option', index: 0 } }]));
  });

  it('lists the proposed stations of a split, and lets the human carry on instead', async () => {
    render(<ActionPanel detail={proposing({ kind: 'split', stations: [{ title: 'Part A', why: 'a' }, { title: 'Part B', why: 'b' }] })} live={[]} />);

    expect(screen.getByText('Découper en 2 stations')).toBeInTheDocument();
    expect(screen.getByText('Part B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer comme prévu' }));

    await waitFor(() => expect(calls[0]?.body).toEqual({ kind: 'option', index: 1 }));
  });
});
