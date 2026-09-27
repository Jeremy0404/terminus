import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReleaseStateDto } from '@terminus/contracts';
import { NetworkRail } from './NetworkRail';
import { APP, NETWORK } from '../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

const RELEASE: ReleaseStateDto = {
  deploysOnRelease: true,
  pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'https://github.com/o/r/pull/87', notes: '### Features\n* contacts' },
  latest: { version: '0.2.0', publishedAt: '2026-08-10T16:54:07Z', url: 'https://github.com/o/r/releases/tag/v0.2.0' },
  lastRun: null,
  deployments: [],
};

function serve(state: ReleaseStateDto | null): void {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(state)));
}

const follows = (first: Element, second: Element): boolean => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('the home rail', () => {
  it('lists what needs you before the production card and the network summary', async () => {
    serve(RELEASE);
    render(<NetworkRail network={NETWORK} onLine={() => {}} onStation={() => {}} onMemory={() => {}} />);

    const production = await screen.findByRole('region', { name: 'Production' });
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    const summary = screen.getByText('Réseau · terminus');
    expect(follows(inbox, production)).toBe(true);
    expect(follows(production, summary)).toBe(true);
  });

  it('keeps the production card compact until its details are asked for', async () => {
    serve(RELEASE);
    render(<NetworkRail network={NETWORK} onLine={() => {}} onStation={() => {}} onMemory={() => {}} />);

    const card = await screen.findByRole('region', { name: 'Production' });
    expect(within(card).getByRole('button', { name: 'Détails' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText('En production')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Actualiser les livraisons' })).not.toBeInTheDocument();
  });

  it('expands the production card in place, and folds it back', async () => {
    serve(RELEASE);
    const onMemory = vi.fn();
    render(<NetworkRail network={NETWORK} onLine={() => {}} onStation={() => {}} onMemory={onMemory} />);

    const card = await screen.findByRole('region', { name: 'Production' });
    fireEvent.click(within(card).getByRole('button', { name: 'Détails' }));
    expect(within(card).getByText('En production')).toBeInTheDocument();
    expect(within(card).getByText('Prêt à livrer')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Actualiser les livraisons' })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Renseigner l’adresse et le cap du produit' }));
    expect(onMemory).toHaveBeenCalled();

    const hide = within(card).getByRole('button', { name: 'Masquer les détails' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(hide);
    expect(within(card).queryByText('En production')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Renseigner l’adresse et le cap du produit' })).not.toBeInTheDocument();
  });

  it('links the expanded card to the address of the product', async () => {
    serve({ ...RELEASE, lastRun: { id: 31, version: '0.2.0', state: 'succeeded', deploymentVerified: true, startedAt: '2026-08-10T16:54:10Z', url: 'https://github.com/o/r/actions/runs/31' } });
    const network = { ...NETWORK, app: { ...APP, product: { purpose: '', audience: '', outOfScope: '', decisions: '', appUrl: 'https://app.example.com' } } };
    render(<NetworkRail network={network} onLine={() => {}} onStation={() => {}} onMemory={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Détails' }));
    expect(screen.getByRole('link', { name: 'Ouvrir l’application' })).toHaveAttribute('href', 'https://app.example.com');
  });

  it('offers no details without a release state', async () => {
    serve(null);
    render(<NetworkRail network={NETWORK} onLine={() => {}} onStation={() => {}} onMemory={() => {}} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByRole('region', { name: 'Production' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Détails' })).not.toBeInTheDocument();
  });
});
