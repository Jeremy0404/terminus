import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IdeasWorkshop } from './IdeasWorkshop';
import { ProductJournal } from './memory/ProductJournal';
import { DecisionDossier, previewLinks } from './platform/DecisionDossier';
import { ProductionCard } from './ProductionCard';
import { APP, NETWORK, detailOf, task } from '../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('product journey', () => {
  it('saves an idea, restores it after reopening and requires a separate repository creation', async () => {
    const drafts: unknown[] = [];
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input); calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path.endsWith('/launch')) return Response.json(APP);
      if (init?.body) { const draft = { ...JSON.parse(String(init.body)), id: 'idea-1', appId: null, updatedAt: 'now' }; drafts.splice(0, drafts.length, draft); return Response.json(draft); }
      return Response.json(drafts);
    }));
    const onFounded = vi.fn();
    const first = render(<IdeasWorkshop onCancel={() => {}} onFounded={onFounded} />);
    await screen.findByText('Idées sauvegardées');
    for (const [label, value] of [['Nom provisoire', 'Carnet'], ['À qui cela rend service ?', 'Cyclistes'], ['Quel problème veux-tu résoudre ?', 'Trajets oubliés'], ['Quel premier résultat serait utile ?', 'Sauvegarder un trajet']] as const) {
      fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Garder le brouillon' }));
    await screen.findByText('Brouillon enregistré dans Terminus.');
    expect(calls.some((call) => call.includes('/launch'))).toBe(false);
    first.unmount();
    render(<IdeasWorkshop onCancel={() => {}} onFounded={onFounded} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carnet' }));
    expect(screen.getByRole('textbox', { name: 'À qui cela rend service ?' })).toHaveValue('Cyclistes');
    fireEvent.click(screen.getByRole('button', { name: 'Voir le parcours de création' }));
    expect(within((await screen.findByText('Créer le socle et le vérifier')).closest('ol')!).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText(/trois premières/)).not.toBeInTheDocument();
    const launch = await screen.findByRole('button', { name: 'Créer le dépôt et démarrer le projet' });
    await waitFor(() => expect(launch).toBeEnabled());
    expect(onFounded).not.toHaveBeenCalled();
    fireEvent.click(launch);
    await waitFor(() => expect(onFounded).toHaveBeenCalledWith(APP.id));
    expect(calls.filter((call) => call.includes('/launch'))).toHaveLength(1);
  });

  it('saves the product journal and displays its persisted feedback', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => Response.json(JSON.parse(String(init?.body))));
    vi.stubGlobal('fetch', fetch);
    render(<ProductJournal app={APP} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Hors périmètre' }), { target: { value: 'Pas de réseau social' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le carnet' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Carnet enregistré.');
    expect(fetch).toHaveBeenCalledWith('/api/apps/app-1/product', expect.objectContaining({ method: 'PUT', body: expect.stringContaining('Pas de réseau social') }));
  });

  it('shows available documents, product constraints and the actual gate consequence', () => {
    const detail = { ...detailOf(NETWORK.tasks[2]!), documents: [{ name: 'plan.md', content: 'Conserver le clavier accessible', truncated: false }] };
    render(<DecisionDossier detail={detail} network={{ ...NETWORK, app: { ...APP, product: { purpose: 'Naviguer', audience: 'Tous', outOfScope: 'Pas de compte public', decisions: '', appUrl: '' } } }} />);
    expect(screen.getByText('Pas de compte public')).toBeInTheDocument();
    expect(screen.getByText('Conserver le clavier accessible')).toBeInTheDocument();
    expect(screen.getByText(/Cette étape sera approuvée/)).toBeInTheDocument();
    expect(previewLinks('{"before":"javascript:alert(1)","after":"https://example.com/preview"}')).toEqual({ after: 'https://example.com/preview' });
  });

  it('shows the server checklist and what confirming it triggers at the server phase', () => {
    const server = task('p1', 'engine', 'Mettre en production', { kind: 'awaiting-gate', gate: 'plan-approval' }, { lifecycleId: 'app-deploy', phases: ['merge', 'server', 'server-check'], phasesInTrack: ['merge', 'server', 'server-check'], phaseIndex: 1 });
    const detail = { ...detailOf(server), documents: [{ name: 'checklist.md', content: 'Enregistrement DNS A', truncated: false }] };
    render(<DecisionDossier detail={detail} network={NETWORK} />);
    expect(screen.getByText('Checklist serveur')).toBeInTheDocument();
    expect(screen.getByText('Enregistrement DNS A')).toBeVisible();
    expect(screen.getByText(/vérifiera DNS, HTTPS et secrets depuis l’extérieur/)).toBeInTheDocument();
  });

  it('never offers the production app from a published release alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ deploysOnRelease: false, pending: null, latest: { version: '1.0.0', publishedAt: '2026-09-26', url: 'https://example.com/release' }, lastRun: { id: 1, version: '1.0.0', state: 'succeeded', startedAt: '2026-09-26', url: 'https://example.com/run' }, deployments: [] })));
    render(<ProductionCard appId="app-1" detailed appUrl="https://example.com" />);
    expect(await screen.findByText(/Aucun déploiement réussi confirmé/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ouvrir l’application' })).not.toBeInTheDocument();
  });
});
