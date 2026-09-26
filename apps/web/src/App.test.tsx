import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { APP, detailOf, mockApi, NETWORK } from './test/fixtures';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        '/apps': [APP],
        '/apps/app-1/network': NETWORK,
        ...Object.fromEntries(NETWORK.tasks.map((task) => [`/tasks/${task.id}`, detailOf(task)])),
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('the cockpit', () => {
  it('opens on the network of the app, with every line and the full inbox', async () => {
    render(<App />);

    expect(await screen.findByRole('img', { name: 'Plan du réseau de terminus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spike CLI, Intégrée au projet' })).toBeInTheDocument();
    const inbox = screen.getByRole('region', { name: 'À toi de jouer' });
    expect(within(inbox).getByText('tout le réseau')).toBeInTheDocument();
    expect(within(inbox).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Rendu SVG'),
      expect.stringContaining('Zoom'),
    ]);
  });

  it('zooms to a line: the rail lists its stations and the inbox narrows to it', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ligne Moteur' }));

    expect(window.location.search).toBe('?app=app-1&line=engine');
    expect(screen.getByRole('navigation', { name: 'Où je suis' })).toHaveTextContent('Moteur');
    expect(within(screen.getByRole('region', { name: 'À toi de jouer' })).getByText('Rien ne t’attend ici.')).toBeInTheDocument();
  });

  it('keeps the map alone on the network, but shows the line card when a line is opened from the map view', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carte' }));
    expect(screen.queryByRole('region', { name: 'À toi de jouer' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ligne Moteur' }));

    expect(screen.getByRole('heading', { name: 'Moteur' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    const trip = screen.getByRole('navigation', { name: 'Où je suis' });
    expect(trip).toHaveTextContent('Réglages');
    fireEvent.click(within(trip).getByRole('button', { name: /Moteur/ }));
    expect(await screen.findByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Où je suis' })).toHaveTextContent('Moteur');
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');
  });
});
