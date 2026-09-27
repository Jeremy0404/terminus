import { describe, expect, it } from 'vitest';
import { APP, NETWORK } from '../test/fixtures';
import { screenOf, type ScreenState } from './screen';

const NETWORK_PLACE = { app: 'app-1', line: null, task: null };
const LINE_PLACE = { app: 'app-1', line: 'engine', task: null };
const PLATFORM_PLACE = { app: 'app-1', line: 'ui', task: 'i1' };

const state = (overrides: Partial<ScreenState> = {}): ScreenState => ({
  founding: false,
  adopting: false,
  panel: null,
  current: APP,
  network: NETWORK,
  place: NETWORK_PLACE,
  ...overrides,
});

describe('the screen of the cockpit', () => {
  it('shows founding over everything else', () => {
    expect(screenOf(state({ founding: true, adopting: true, panel: 'settings', place: PLATFORM_PLACE }))).toEqual({ kind: 'founding' });
    expect(screenOf(state({ founding: true, panel: 'memory', network: null }))).toEqual({ kind: 'founding' });
  });

  it('shows adopting over the panels, the loading state and the journey', () => {
    expect(screenOf(state({ adopting: true, panel: 'settings' }))).toEqual({ kind: 'adopting' });
    expect(screenOf(state({ adopting: true, network: null }))).toEqual({ kind: 'adopting' });
    expect(screenOf(state({ adopting: true, place: LINE_PLACE }))).toEqual({ kind: 'adopting' });
  });

  it('shows the settings even without a known app or a loaded network', () => {
    expect(screenOf(state({ panel: 'settings' }))).toEqual({ kind: 'settings' });
    expect(screenOf(state({ panel: 'settings', current: null, network: null }))).toEqual({ kind: 'settings' });
  });

  it('shows the memory of the current app, and falls through without one', () => {
    expect(screenOf(state({ panel: 'memory' }))).toEqual({ kind: 'memory', app: APP });
    expect(screenOf(state({ panel: 'memory', current: null, network: null }))).toEqual({ kind: 'empty' });
    expect(screenOf(state({ panel: 'memory', current: null }))).toEqual({ kind: 'network', network: NETWORK });
  });

  it('shows the empty state while the network is not loaded', () => {
    expect(screenOf(state({ network: null }))).toEqual({ kind: 'empty' });
    expect(screenOf(state({ network: null, current: null, place: PLATFORM_PLACE }))).toEqual({ kind: 'empty' });
  });

  it('shows the platform of the place task', () => {
    expect(screenOf(state({ place: PLATFORM_PLACE }))).toEqual({ kind: 'platform', network: NETWORK, taskId: 'i1' });
  });

  it('shows the line of the place', () => {
    expect(screenOf(state({ place: LINE_PLACE }))).toEqual({ kind: 'line', network: NETWORK, lineId: 'engine' });
  });

  it('shows the whole network with its rail at home', () => {
    expect(screenOf(state())).toEqual({ kind: 'network', network: NETWORK });
  });
});
