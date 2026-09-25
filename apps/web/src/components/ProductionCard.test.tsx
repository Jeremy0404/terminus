import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReleaseStateDto } from '@terminus/contracts';
import { ProductionCard } from './ProductionCard';

afterEach(() => vi.unstubAllGlobals());

let posted: { path: string; body: unknown }[];

function serve(state: ReleaseStateDto | null) {
  posted = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push({ path: String(input), body: JSON.parse(String(init.body)) });
        return Response.json({ id: 'deploy-1', version: '1.0.0', pullRequest: 87, requestedAt: 'x', state: 'requested', runUrl: null, finishedAt: null }, { status: 202 });
      }
      return Response.json(state);
    }),
  );
}

describe('ProductionCard', () => {
  it('shows what runs in production, the last release run and the release waiting', async () => {
    serve({
      deploysOnRelease: false,
      pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'https://github.com/o/r/pull/87', notes: '' },
      latest: { version: '0.2.0', publishedAt: '2026-08-10T16:54:07Z', url: 'https://github.com/o/r/releases/tag/v0.2.0' },
      lastRun: { id: 31, version: '0.2.0', state: 'succeeded', startedAt: '2026-08-10T16:54:10Z', url: 'https://github.com/o/r/actions/runs/31' },
      deployments: [],
    });
    render(<ProductionCard appId="app-1" />);

    expect(await screen.findByText(/En production : v0\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText('v0.2.0 livrée')).toHaveAttribute('href', 'https://github.com/o/r/actions/runs/31');
    expect(screen.getByText('Prête à livrer : v1.0.0')).toHaveAttribute('href', 'https://github.com/o/r/pull/87');
    expect(screen.getByText(/pas de job de déploiement/)).toBeInTheDocument();
  });

  it('deploys the waiting release only after an explicit confirmation', async () => {
    serve({
      deploysOnRelease: true,
      pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'u', notes: '### Features\n* contacts' },
      latest: null,
      lastRun: null,
      deployments: [],
    });
    render(<ProductionCard appId="app-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Déployer v1.0.0' }));
    expect(screen.getByRole('dialog', { name: 'Déployer v1.0.0 en production ?' })).toHaveTextContent('construit, signe et déploie');
    expect(posted).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Oui, déployer' }));

    await waitFor(() => expect(posted).toEqual([{ path: '/api/apps/app-1/release/deploy', body: { version: '1.0.0' } }]));
  });

  it('stays hidden for an app without a release workflow', async () => {
    serve(null);
    const { container } = render(<ProductionCard appId="app-1" />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container).toBeEmptyDOMElement();
  });
});
