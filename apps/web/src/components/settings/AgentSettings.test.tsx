import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AgentPhaseDto } from '@terminus/contracts';
import { AgentSettings } from './AgentSettings';

const PHASES: AgentPhaseDto[] = [
  { key: 'epic.breakdown', lifecycleId: 'epic', phaseId: 'breakdown', choice: { model: null, effort: null } },
  { key: 'task.execute', lifecycleId: 'task', phaseId: 'execute', choice: { model: 'opus', effort: 'high' } },
];

let calls: { method: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? 'GET', body });
      return Response.json(PHASES);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('AgentSettings', () => {
  it('edits the default model and effort of each agent phase and saves them together', async () => {
    render(<AgentSettings onClose={() => {}} />);

    const model = await screen.findByRole('combobox', { name: "Modèle · Découpage d'épique" });
    expect(screen.getByRole('combobox', { name: 'Modèle · Exécution' })).toHaveValue('opus');
    fireEvent.change(model, { target: { value: 'haiku' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Enregistré'));
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      body: { defaults: { 'epic.breakdown': { model: 'haiku', effort: null }, 'task.execute': { model: 'opus', effort: 'high' } } },
    });
  });
});
