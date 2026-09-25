import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ObsoleteFlag } from './ObsoleteFlag';

let calls: string[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 204 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('ObsoleteFlag', () => {
  it('lets the human close the flagged station or keep it', async () => {
    render(<ObsoleteFlag flag={{ proposalId: 'p1', taskId: 't2', sourceTitle: 'Show live progress', reason: 'The progress bar already does it.' }} />);

    expect(screen.getByText('Peut-être déjà couverte par « Show live progress »')).toBeInTheDocument();
    expect(screen.getByText('The progress bar already does it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer comme obsolète' }));
    await waitFor(() => expect(calls).toEqual(['/api/memory-proposals/p1/accept']));

    fireEvent.click(screen.getByRole('button', { name: 'Garder' }));
    await waitFor(() => expect(calls.at(-1)).toBe('/api/memory-proposals/p1/dismiss'));
  });
});
