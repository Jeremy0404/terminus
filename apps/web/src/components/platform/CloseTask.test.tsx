import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { detailOf, task } from '../../test/fixtures';
import { ActionPanel } from './ActionPanel';
import { CloseTask } from './CloseTask';

let calls: { path: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({ task: {}, warnings: ['Pull request #27 could not be closed: network down'] });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('CloseTask', () => {
  it('closes with a picked reason and optional evidence, and shows what could not be cleaned up', async () => {
    render(<CloseTask taskId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer sans merge…' }));
    expect(screen.getByRole('button', { name: 'Clôturer' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Déjà réalisée' }));
    fireEvent.change(screen.getByLabelText('PR, commit ou raison (facultatif)'), { target: { value: 'Covered by #26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(calls).toEqual([{ path: '/api/tasks/t1/close', body: { reason: 'already-done', evidence: 'Covered by #26' } }]));
    expect(await screen.findByText('Pull request #27 could not be closed: network down')).toBeInTheDocument();
  });
});

describe('a closed task', () => {
  it('shows why it was closed', () => {
    render(<ActionPanel detail={detailOf(task('t1', 'ui', 'Zoom', { kind: 'closed', reason: 'duplicate', evidence: 'Same as station #3' }))} live={[]} />);
    expect(screen.getByText('Clôturée · Doublon')).toBeInTheDocument();
    expect(screen.getByText('Same as station #3')).toBeInTheDocument();
  });
});
