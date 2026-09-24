import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdoptionWizard } from './AdoptionWizard';

let posted: { path: string; body: unknown }[];

beforeEach(() => {
  posted = [];
  const responses: Record<string, unknown> = {
    '/api/adoption/scan': {
      repoPath: '/dev/tiny-prm', name: 'tiny-prm', isGitRepo: true, hasOrigin: true, defaultBranch: 'main', packageManager: 'pnpm',
      ciWorkflows: ['ci.yml'], agentDocs: ['CLAUDE.md'],
      suggestedVerification: [{ name: 'lint', command: 'pnpm run lint' }, { name: 'test', command: 'pnpm run test' }], todos: [],
    },
    '/api/adoption/health': [
      { name: 'lint', command: 'pnpm run lint', ok: true, exitCode: 0, outputTail: '', durationMs: 5 },
      { name: 'test', command: 'pnpm run test', ok: false, exitCode: 1, outputTail: '1 failing', durationMs: 9 },
    ],
    '/api/adoption/proposals': {
      issues: [{ number: 51, title: 'i18n', url: 'u51', labels: [] }, { number: 52, title: 'Tags par défaut', url: 'u52', labels: [] }],
      todos: [{ file: 'src/a.ts', line: 3, text: '// TODO: vider le cache' }],
      warnings: [],
    },
    '/api/adoption/cut-over': { app: { id: 'app-9', name: 'tiny-prm', repoPath: '/dev/tiny-prm' }, closedIssues: [52], closeErrors: [] },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      posted.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json(responses[path], { status: path.endsWith('cut-over') ? 201 : 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('AdoptionWizard', () => {
  it('walks the five stations and cuts over with what was chosen', async () => {
    const onAdopted = vi.fn();
    render(<AdoptionWizard onCancel={() => {}} onAdopted={onAdopted} />);

    fireEvent.change(screen.getByLabelText('Chemin du repo'), { target: { value: '/dev/tiny-prm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scanner' }));
    expect(await screen.findByText('CLAUDE.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette station' }));

    expect(await screen.findByText('1 failing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette station' }));

    fireEvent.click(await screen.findByLabelText('#51 · i18n'));
    fireEvent.click(screen.getByLabelText(/vider le cache/));
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette station' }));

    fireEvent.click(screen.getByRole('button', { name: 'Retirer lint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider cette station' }));

    expect(screen.getByText('2 stations sur la ligne « Backlog importé », 1 commandes de vérification.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Basculer' }));

    await waitFor(() => expect(posted.at(-1)?.path).toBe('/api/adoption/cut-over'));
    expect(posted.at(-1)?.body).toEqual({
      name: 'tiny-prm',
      repoPath: '/dev/tiny-prm',
      verification: [{ name: 'test', command: 'pnpm run test' }],
      lines: [{ code: 'B', name: 'Backlog importé', tasks: [{ title: 'Tags par défaut', issueNumber: 52 }, { title: 'vider le cache' }] }],
      closeIssues: true,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le réseau' }));
    expect(onAdopted).toHaveBeenCalledWith('app-9');
  });

  it('cannot leave the scan station before a scan succeeded', () => {
    render(<AdoptionWizard onCancel={() => {}} onAdopted={() => {}} />);
    expect(screen.getByRole('button', { name: 'Valider cette station' })).toBeDisabled();
  });
});
