import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { task } from '../../test/fixtures';
import { AgentPicker } from './AgentPicker';

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

describe('AgentPicker', () => {
  it('shows the task choice and saves a new model and effort right away', async () => {
    render(<AgentPicker task={task('t1', 'ui', 'Zoom', { kind: 'todo' }, { agent: { model: 'sonnet', effort: null } })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sonnet' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Effort · Zoom' }), { target: { value: 'low' } });
    await waitFor(() => expect(calls).toEqual([{ path: '/api/tasks/t1/agent', body: { model: 'sonnet', effort: 'low' } }]));

    fireEvent.change(screen.getByRole('combobox', { name: 'Modèle · Zoom' }), { target: { value: '' } });
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ model: null, effort: 'low' }));
  });

  it('cannot change once the task is finished', () => {
    render(<AgentPicker task={task('t1', 'ui', 'Zoom', { kind: 'done' })} />);
    expect(screen.getByRole('button', { name: 'Modèle par défaut' })).toBeDisabled();
  });
});
