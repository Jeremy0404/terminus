import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkDto } from '@terminus/contracts';
import type { Place } from '../state/location';
import { NETWORK } from '../test/fixtures';
import { NetworkExplorer } from './NetworkExplorer';

const NETWORK_PLACE: Place = { app: 'app-1', line: null, task: null };
const LINE_PLACE: Place = { app: 'app-1', line: 'ui', task: null };
const PLATFORM_PLACE: Place = { app: 'app-1', line: 'ui', task: 'i1' };
const REMOVED_CONTROLS = ['Tout', 'Reste à faire', 'Itinéraire'];

function renderExplorer(place: Place, network: NetworkDto = NETWORK) {
  return render(<NetworkExplorer network={network} place={place} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);
}

function expectNoRemovedControls() {
  for (const name of REMOVED_CONTROLS) expect(screen.queryByText(name)).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('NetworkExplorer search', () => {
  it('keeps the map while typing and filters it once the search settles', () => {
    vi.useFakeTimers();
    render(<NetworkExplorer network={NETWORK} place={{ app: 'app-1', line: null, task: null }} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);
    const map = screen.getByRole('img');
    const search = screen.getByRole('searchbox', { name: 'Rechercher une station' });

    for (const value of ['z', 'zo', 'zoo']) fireEvent.change(search, { target: { value } });

    expect(screen.getByRole('img')).toBe(map);
    expect(screen.getByText('4 stations sélectionnées')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('1 station sélectionnée')).toBeInTheDocument();
  });

  it('filters the list view too', () => {
    vi.useFakeTimers();
    const { container } = renderExplorer(NETWORK_PLACE);
    fireEvent.click(screen.getByRole('button', { name: 'Vue liste' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une station' }), { target: { value: 'zoom' } });
    act(() => vi.advanceTimersByTime(1000));

    const entries = container.querySelectorAll('ul.station-list > li');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent('Zoom');
    expect(screen.getByText('1 station sélectionnée')).toBeInTheDocument();
  });

  it('points to the search when nothing matches', () => {
    vi.useFakeTimers();
    const { container } = renderExplorer(NETWORK_PLACE);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une station' }), { target: { value: 'introuvable' } });
    act(() => vi.advanceTimersByTime(1000));

    const empty = container.querySelector('.explorer-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).not.toHaveTextContent('filtres');
  });
});

describe('NetworkExplorer toolbar', () => {
  it.each([
    ['network', NETWORK_PLACE],
    ['line', LINE_PLACE],
  ])('keeps only search, list/map, count and legend at the %s level', (_level, place) => {
    const { container } = renderExplorer(place);

    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Vue liste' })).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('4 stations sélectionnées');
    expect(container.querySelector('details.map-legend')).toHaveTextContent('Lire les symboles du réseau');
    expectNoRemovedControls();
    expect(screen.queryByText('Recentrer')).not.toBeInTheDocument();
  });

  it('recenters the platform mini-map by remounting it', () => {
    renderExplorer(PLATFORM_PLACE);
    const previous = screen.getByRole('img');

    fireEvent.click(screen.getByRole('button', { name: 'Recentrer' }));

    expect(screen.getByRole('img')).not.toBe(previous);
    expectNoRemovedControls();
  });

  it('offers no recentring on the platform list view', () => {
    renderExplorer(PLATFORM_PLACE);

    fireEvent.click(screen.getByRole('button', { name: 'Vue liste' }));
    expect(screen.queryByRole('button', { name: 'Recentrer' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vue carte' }));
    expect(screen.getByRole('button', { name: 'Recentrer' })).toBeInTheDocument();
  });

  it('switches between the map and the station list', () => {
    const { container } = renderExplorer(NETWORK_PLACE);

    fireEvent.click(screen.getByRole('button', { name: 'Vue liste' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelectorAll('ul.journey-list.station-list > li')).toHaveLength(NETWORK.tasks.length);

    fireEvent.click(screen.getByRole('button', { name: 'Vue carte' }));
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(container.querySelector('ul.station-list')).not.toBeInTheDocument();
  });

  it('keeps the delivered-lines toggle on the map', () => {
    const network: NetworkDto = { ...NETWORK, epics: NETWORK.epics.map((epic) => (epic.id === 'engine' ? { ...epic, status: 'delivered' } : epic)) };
    renderExplorer(NETWORK_PLACE, network);
    const toggle = screen.getByRole('button', { name: 'Replier les lignes terminées' });

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Replier les lignes terminées' })).toHaveAttribute('aria-pressed', 'true');
  });
});
