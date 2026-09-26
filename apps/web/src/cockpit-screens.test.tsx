import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { APP, detailOf, mockApi, NETWORK } from './test/fixtures';

const MEMORY = { lessons: [], terms: [], proposals: [], pack: '' };

function stubApi(apps: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      mockApi({
        '/apps': apps,
        '/apps/app-1/network': NETWORK,
        '/apps/app-1/memory': MEMORY,
        '/ideas': [],
        ...Object.fromEntries(NETWORK.tasks.map((task) => [`/tasks/${task.id}`, detailOf(task)])),
      }),
    ),
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  stubApi([APP]);
});
afterEach(() => vi.unstubAllGlobals());

describe('the cockpit screens', () => {
  it('keeps the map explorer search when zooming into a line and back', async () => {
    render(<App />);
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Rechercher une station' }), { target: { value: 'CLI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Ligne Moteur' }));
    expect(window.location.search).toBe('?app=app-1&line=engine');
    expect(screen.getByRole('searchbox', { name: 'Rechercher une station' })).toHaveValue('CLI');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.location.search).toBe('?app=app-1');
    expect(screen.getByRole('searchbox', { name: 'Rechercher une station' })).toHaveValue('CLI');
  });

  it('keeps the map explorer search when switching to the map tab and back', async () => {
    render(<App />);
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Rechercher une station' }), { target: { value: 'CLI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));
    expect(screen.getByRole('searchbox', { name: 'Rechercher une station' })).toHaveValue('CLI');

    fireEvent.click(screen.getByRole('button', { name: 'Vue d’ensemble' }));
    expect(screen.getByRole('searchbox', { name: 'Rechercher une station' })).toHaveValue('CLI');
  });

  it('offers to found an app when there is none, and comes back when founding is cancelled', async () => {
    stubApi([]);
    render(<App />);
    expect(await screen.findByText('Aucune app pour l’instant.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Nouvelle app' }).at(-1)!);
    expect(await screen.findByRole('heading', { name: 'Atelier des idées' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’atelier' }));

    expect(await screen.findByText('Aucune app pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Atelier des idées' })).not.toBeInTheDocument();
  });

  it('offers to adopt a repo when there is no app, and comes back when adopting is cancelled', async () => {
    stubApi([]);
    render(<App />);
    expect(await screen.findByText('Aucune app pour l’instant.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Adopter un repo' }).at(-1)!);
    expect(screen.getByRole('heading', { name: 'Adopter un repo existant' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText('Aucune app pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Adopter un repo existant' })).not.toBeInTheDocument();
  });

  it('opens the project memory from the place it was asked, and Escape goes back there', async () => {
    window.history.replaceState(null, '', '/?app=app-1&line=engine');
    render(<App />);
    await screen.findByRole('button', { name: 'Ligne Moteur' });

    fireEvent.click(screen.getByRole('button', { name: 'Carnet produit' }));
    expect(await screen.findByRole('heading', { name: 'terminus' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Où je suis' })).toHaveTextContent('Carnet produit');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'terminus' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
    expect(window.location.search).toBe('?app=app-1&line=engine');
  });
});
