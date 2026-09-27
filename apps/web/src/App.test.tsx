import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { NetworkDto } from '@terminus/contracts';
import { App } from './App';
import { APP, detailOf, mockApi, NETWORK, task } from './test/fixtures';
import { saveJourney, snapshot } from './state/journey';

function serve(network: NetworkDto, extra: Record<string, unknown> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        '/apps': [APP],
        '/apps/app-1/network': network,
        ...Object.fromEntries(network.tasks.map((item) => [`/tasks/${item.id}`, detailOf(item)])),
        ...extra,
      }),
    ),
  );
}

function chooseInAppMenu(entry: string): void {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'terminus' }));
  fireEvent.click(screen.getByRole('menuitem', { name: entry }));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  serve(NETWORK);
});
afterEach(() => vi.unstubAllGlobals());

describe('the cockpit', () => {
  it('opens on the network of the app, with every line and the full inbox', async () => {
    serve({ ...NETWORK, tasks: [...NETWORK.tasks, task('m3', 'engine', 'Journal', { kind: 'todo' })] });
    render(<App />);

    expect(await screen.findByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spike CLI, Intégrée au projet' })).toBeInTheDocument();
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(within(inbox).getByText('tout le réseau')).toBeInTheDocument();
    expect(within(inbox).getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Décisions attendues 1',
      'À débloquer 1',
      'Stations en cours 1',
      'Prêts à démarrer 1',
    ]);
    expect(within(inbox).getAllByRole('listitem').map((item) => item.querySelector('.inbox-task')?.textContent)).toEqual([
      'Rendu SVG',
      'Zoom',
      'Adaptateur CLI',
      'Journal',
    ]);
  });

  it('zooms to a line: the rail lists its stations and the inbox narrows to it', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ligne Moteur' }));

    expect(window.location.search).toBe('?app=app-1&line=engine');
    expect(screen.getByRole('navigation', { name: 'Où je suis' })).toHaveTextContent('Moteur');
    expect(within(screen.getByRole('region', { name: 'À toi de jouer' })).getByText('Rien ne t’attend ici.')).toBeInTheDocument();
  });

  it('opening a line from the home map shows its line card and a line-scoped list', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ligne Moteur' }));

    expect(screen.getByRole('heading', { name: 'Moteur' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'À toi de jouer' })).getByText('ligne M')).toBeInTheDocument();
  });

  it('has no tabs: one home screen with the map and the list', async () => {
    render(<App />);

    expect(await screen.findByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'À toi de jouer' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navigation du cockpit' })).not.toBeInTheDocument();
    for (const name of ['Carte', 'Vue d’ensemble', 'À décider', 'En cours', 'Livraisons']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('keeps one app menu in the top bar, named after the app, with nothing else to press', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    render(<App />);
    await screen.findByRole('img', { name: 'Plan du réseau de terminus' });

    const [trigger, ...others] = within(screen.getByRole('banner')).getAllByRole('button');
    expect(others).toEqual([]);
    expect(trigger).toHaveAccessibleName('terminus');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    for (const name of ['Réglages', 'Carnet produit', 'Activer les notifications']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('asks for notifications from the app menu, and stops offering once they are decided', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const view = render(<App />);
    await screen.findByRole('img', { name: 'Plan du réseau de terminus' });

    chooseInAppMenu('Activer les notifications');
    expect(requestPermission).toHaveBeenCalledOnce();
    await act(async () => {});
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'terminus' }));
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Activer les notifications' })).not.toBeInTheDocument();
    view.unmount();

    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    render(<App />);
    await screen.findByRole('img', { name: 'Plan du réseau de terminus' });
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'terminus' }));
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Activer les notifications' })).not.toBeInTheDocument();
  });

  it('ignores an old tab in the address and drops it on the next move', async () => {
    window.history.replaceState(null, '', '/?app=app-1&view=deliveries');
    render(<App />);

    expect(await screen.findByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'À toi de jouer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ligne Moteur' }));
    expect(window.location.search).toBe('?app=app-1&line=engine');
  });

  it('opens a phone on the same map and list', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(max-width: 640px)', media: query, addEventListener: () => {}, removeEventListener: () => {} })));
    render(<App />);

    expect(await screen.findByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'À toi de jouer' })).toBeInTheDocument();
  });

  it('jumps from an inbox item straight to its platform, and Escape goes back up', async () => {
    render(<App />);
    const inbox = await screen.findByRole('region', { name: 'À toi de jouer' });
    fireEvent.click(within(inbox).getByRole('button', { name: /Rendu SVG/ }));

    const platform = await screen.findByRole('region', { name: 'Quai de Rendu SVG' });
    expect(within(platform).getByText('Attend ta review')).toBeInTheDocument();
    expect(within(platform).getByText(/Dessiner les lignes en SVG\.\s+Une couleur par ligne\./)).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=ui&task=i1');
    expect(within(screen.getByRole('main')).getByRole('region', { name: 'Quai de Rendu SVG' })).toBeInTheDocument();
    expect(screen.getByText('Afficher la carte de repérage').closest('details')).not.toHaveAttribute('open');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.location.search).toBe('?app=app-1&line=ui');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.location.search).toBe('?app=app-1');
  });

  it('says so when the daemon cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<App />);
    expect(await screen.findByText('Démon injoignable')).toBeInTheDocument();
  });

  it('leaves the settings for the place it came from, by the trip or by Escape', async () => {
    window.history.replaceState(null, '', '/?app=app-1&line=engine');
    render(<App />);
    await screen.findByRole('button', { name: 'Ligne Moteur' });

    chooseInAppMenu('Réglages');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const trip = screen.getByRole('navigation', { name: 'Où je suis' });
    expect(trip).toHaveTextContent('Réglages');
    fireEvent.click(within(trip).getByRole('button', { name: /Moteur/ }));
    expect(await screen.findByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');

    chooseInAppMenu('Réglages');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Où je suis' })).toHaveTextContent('Moteur');
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');
  });

  it('closes the app menu on Escape without leaving the place, and only the next Escape goes up', async () => {
    window.history.replaceState(null, '', '/?app=app-1&line=engine');
    render(<App />);
    await screen.findByRole('button', { name: 'Ligne Moteur' });

    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'terminus' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');
    expect(screen.getByRole('heading', { name: 'Moteur' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.location.search).toBe('?app=app-1');
  });

  it('offers to resume the last station opened, and goes there', async () => {
    saveJourney('app-1', snapshot(NETWORK, 'i1'));
    render(<App />);

    const inbox = await screen.findByRole('region', { name: 'À toi de jouer' });
    fireEvent.click(within(inbox).getByRole('button', { name: 'Reprendre là où j’en étais : Rendu SVG' }));
    expect(window.location.search).toBe('?app=app-1&line=ui&task=i1');
  });

  it('no longer offers to resume a station that is done or closed', async () => {
    saveJourney('app-1', snapshot(NETWORK, 'i1'));
    for (const status of [{ kind: 'done' as const }, { kind: 'closed' as const, reason: 'abandoned' as const, evidence: '' }]) {
      serve({ ...NETWORK, tasks: NETWORK.tasks.map((item) => (item.id === 'i1' ? { ...item, status } : item)) });
      const view = render(<App />);
      await screen.findByRole('region', { name: 'À toi de jouer' });
      expect(screen.queryByRole('button', { name: /Reprendre/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('remembers the station just opened as the one to resume', async () => {
    render(<App />);
    const inbox = await screen.findByRole('region', { name: 'À toi de jouer' });
    fireEvent.click(within(inbox).getByRole('button', { name: /Zoom/ }));
    await screen.findByRole('region', { name: 'Quai de Zoom' });

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(within(screen.getByRole('region', { name: 'À toi de jouer' })).getByRole('button', { name: 'Reprendre là où j’en étais : Zoom' })).toBeInTheDocument();
  });

  it('no longer counts what changed since the last visit', async () => {
    saveJourney('app-1', snapshot({ ...NETWORK, tasks: NETWORK.tasks.filter((item) => item.id !== 'i2') }, null));
    serve({ ...NETWORK, tasks: NETWORK.tasks.map((item) => (item.id === 'm2' ? { ...item, status: { kind: 'done' as const } } : item)) });
    render(<App />);

    await screen.findByRole('region', { name: 'À toi de jouer' });
    expect(screen.queryByText('Depuis ta dernière visite')).not.toBeInTheDocument();
    expect(screen.queryByText(/^1 réalisée|nouvelle station|nouvelle intervention/)).not.toBeInTheDocument();
  });

  it('opens the delivery details in place on the home screen', async () => {
    serve(NETWORK, { '/apps/app-1/release': { deploysOnRelease: true, pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'u', notes: '' }, latest: null, lastRun: null, deployments: [] } });
    render(<App />);

    const card = await screen.findByRole('region', { name: 'Production' });
    fireEvent.click(within(card).getByRole('button', { name: 'Détails' }));
    expect(within(card).getByText('En production')).toBeInTheDocument();
    expect(within(card).getByText('Prêt à livrer')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Actualiser les livraisons' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Renseigner l’adresse et le cap du produit' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'À toi de jouer' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});
