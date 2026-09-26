import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK } from '../test/fixtures';
import { NetworkExplorer } from './NetworkExplorer';

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
});
