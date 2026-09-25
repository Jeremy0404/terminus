import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MemoryDto } from '@terminus/contracts';
import { APP } from '../../test/fixtures';
import { ProjectMemory } from './ProjectMemory';

let memory: MemoryDto;
let calls: { method: string; path: string; body: unknown }[];

beforeEach(() => {
  memory = { lessons: [{ id: 'l1', text: 'Run the migrations first.', sourceTaskId: null, createdAt: 'x' }], terms: [], proposals: [], pack: '# Project memory' };
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? 'GET', path: String(input), body });
      if (init?.method === 'POST') {
        memory = { ...memory, terms: [{ id: 't1', term: body.term, definition: body.definition, updatedAt: 'x' }] };
        return Response.json(memory.terms[0]);
      }
      if (init?.method === 'DELETE') {
        memory = { ...memory, lessons: [] };
        return new Response(null, { status: 204 });
      }
      return Response.json(memory);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('ProjectMemory', () => {
  it('adds a term, removes a lesson and shows what agents receive', async () => {
    render(<ProjectMemory app={APP} onClose={() => {}} />);

    expect(await screen.findByText('Run the migrations first.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Terme' }), { target: { value: 'Station' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Définition' }), { target: { value: 'A task on a line.' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!);

    expect(await screen.findByText('Station')).toBeInTheDocument();
    expect(calls).toContainEqual({ method: 'POST', path: `/api/apps/${APP.id}/terms`, body: { term: 'Station', definition: 'A task on a line.' } });
    expect(screen.getByRole('textbox', { name: 'Terme' })).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Retirer « Run the migrations first. »' }));
    await waitFor(() => expect(screen.getByText('Aucune leçon pour l’instant.')).toBeInTheDocument());
    expect(screen.getByText('# Project memory')).toBeInTheDocument();
  });

  it('lists proposals from the retrospective and accepts one', async () => {
    memory = {
      ...memory,
      proposals: [{ id: 'p1', sourceTaskId: 't1', sourceTitle: 'Zoom', proposed: { kind: 'lesson', text: 'Keep phases in YAML.' }, why: 'Decided in the grill.' }],
    };
    render(<ProjectMemory app={APP} onClose={() => {}} />);

    expect(await screen.findByText('Leçon proposée après « Zoom »')).toBeInTheDocument();
    expect(screen.getByText('Decided in the grill.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter à la mémoire' }));

    await waitFor(() => expect(calls).toContainEqual({ method: 'POST', path: '/api/memory-proposals/p1/accept', body: undefined }));
  });
});
