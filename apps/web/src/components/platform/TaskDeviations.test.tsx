import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDetailDto } from '@terminus/contracts';
import { detailOf, task } from '../../test/fixtures';
import { TaskDeviations } from './TaskDeviations';

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

const atPlanGate: TaskDetailDto = {
  ...detailOf(task('t1', 'ui', 'Zoom', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 2 })),
  actions: [{ kind: 'approve', gate: 'plan-approval' }, { kind: 'send-back' }, { kind: 'skip-phase', phaseId: 'plan' }],
};

describe('TaskDeviations', () => {
  it('skips the current phase when the harness allows it', async () => {
    render(<TaskDeviations detail={atPlanGate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Passer « Plan »' }));
    await waitFor(() => expect(calls).toEqual([{ path: '/api/tasks/t1/skip', body: undefined }]));
  });

  it('switches to the other track', async () => {
    render(<TaskDeviations detail={atPlanGate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Passer en Parcours léger' }));
    await waitFor(() => expect(calls).toEqual([{ path: '/api/tasks/t1/track', body: { track: 'light' } }]));
  });

  it('offers no skip when the phase cannot be skipped, and nothing while a run is in progress', () => {
    const { rerender } = render(<TaskDeviations detail={{ ...atPlanGate, actions: [] }} />);
    expect(screen.queryByRole('button', { name: /Passer « / })).not.toBeInTheDocument();
    rerender(<TaskDeviations detail={detailOf(task('t1', 'ui', 'Zoom', { kind: 'running', runId: 'r' }))} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
