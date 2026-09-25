import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkDto } from '@terminus/contracts';
import { NETWORK } from '../test/fixtures';
import type { Place } from '../state/location';
import { NetworkMap } from './NetworkMap';

const NETWORK_PLACE: Place = { app: 'app-1', line: null, task: null };

const withDelivered = (network: NetworkDto, ...ids: string[]): NetworkDto => ({
  ...network,
  epics: network.epics.map((epic) => (ids.includes(epic.id) ? { ...epic, status: 'delivered' } : epic)),
});

function renderMap(network: NetworkDto, place: Place = NETWORK_PLACE) {
  return render(<NetworkMap network={network} place={place} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);
}

const hideToggle = () => screen.queryByRole('button', { name: 'Masquer les lignes livrées' });

beforeEach(() => window.localStorage.clear());

describe('NetworkMap delivered lines', () => {
  it('offers no toggle while no line is delivered', () => {
    renderMap(NETWORK);
    expect(hideToggle()).not.toBeInTheDocument();
  });

  it('hides and shows delivered lines with the toggle', () => {
    renderMap(withDelivered(NETWORK, 'engine'));
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();

    fireEvent.click(hideToggle() as HTMLElement);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Ligne Moteur' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligne Interface' })).toBeInTheDocument();

    fireEvent.click(hideToggle() as HTMLElement);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
  });

  it('remembers the choice across a reload', () => {
    const network = withDelivered(NETWORK, 'engine');
    const first = renderMap(network);
    fireEvent.click(hideToggle() as HTMLElement);
    first.unmount();

    renderMap(network);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Ligne Moteur' })).not.toBeInTheDocument();
  });

  it('keeps the open line on the map even when it is delivered and hidden', () => {
    const network = withDelivered(NETWORK, 'engine');
    const first = renderMap(network);
    fireEvent.click(hideToggle() as HTMLElement);
    first.unmount();

    renderMap(network, { app: 'app-1', line: 'engine', task: null });
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
  });

  it('says so instead of drawing an empty map when every line is delivered and hidden', () => {
    renderMap(withDelivered(NETWORK, 'engine', 'ui'));
    fireEvent.click(hideToggle() as HTMLElement);
    expect(screen.getByText('Toutes les lignes sont livrées.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
