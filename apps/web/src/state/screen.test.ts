import { describe, expect, it } from 'vitest';
import { APP, NETWORK } from '../test/fixtures';
import { VIEWS } from './location';
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
  view: 'overview',
  ...overrides,
});

describe('the screen of the cockpit', () => {
  it('shows founding over everything else', () => {
    expect(screenOf(state({ founding: true, adopting: true, panel: 'settings', place: PLATFORM_PLACE, view: 'map' }))).toEqual({ kind: 'founding' });
    expect(screenOf(state({ founding: true, panel: 'memory', network: null }))).toEqual({ kind: 'founding' });
  });

  it('shows adopting over the panels, the loading state and the journey', () => {
    expect(screenOf(state({ adopting: true, panel: 'settings' }))).toEqual({ kind: 'adopting' });
    expect(screenOf(state({ adopting: true, network: null }))).toEqual({ kind: 'adopting' });
    expect(screenOf(state({ adopting: true, place: LINE_PLACE, view: 'deliveries' }))).toEqual({ kind: 'adopting' });
  });

  it('shows the settings even without a known app or a loaded network', () => {
    expect(screenOf(state({ panel: 'settings' }))).toEqual({ kind: 'settings' });
    expect(screenOf(state({ panel: 'settings', current: null, network: null }))).toEqual({ kind: 'settings' });
  });

  it('shows the memory of the current app, and falls through without one', () => {
    expect(screenOf(state({ panel: 'memory' }))).toEqual({ kind: 'memory', app: APP });
    expect(screenOf(state({ panel: 'memory', current: null, network: null }))).toEqual({ kind: 'empty' });
    expect(screenOf(state({ panel: 'memory', current: null }))).toEqual({ kind: 'network', network: NETWORK, mapOnly: false });
  });

  it('shows the empty state while the network is not loaded', () => {
    expect(screenOf(state({ network: null }))).toEqual({ kind: 'empty' });
    expect(screenOf(state({ network: null, current: null, place: PLATFORM_PLACE, view: 'active' }))).toEqual({ kind: 'empty' });
  });

  it('shows the platform of the place task whatever the tab', () => {
    for (const view of VIEWS) {
      expect(screenOf(state({ place: PLATFORM_PLACE, view }))).toEqual({ kind: 'platform', network: NETWORK, taskId: 'i1' });
    }
  });

  it('shows the deliveries, decisions and active tabs at network and line level', () => {
    for (const view of ['deliveries', 'decisions', 'active'] as const) {
      expect(screenOf(state({ view }))).toEqual({ kind: view, network: NETWORK });
      expect(screenOf(state({ view, place: LINE_PLACE }))).toEqual({ kind: view, network: NETWORK });
    }
  });

  it('shows the line of the place under the overview and map tabs', () => {
    expect(screenOf(state({ place: LINE_PLACE }))).toEqual({ kind: 'line', network: NETWORK, lineId: 'engine' });
    expect(screenOf(state({ place: LINE_PLACE, view: 'map' }))).toEqual({ kind: 'line', network: NETWORK, lineId: 'engine' });
  });

  it('shows the network with its rail under overview, and the map alone under the map tab', () => {
    expect(screenOf(state())).toEqual({ kind: 'network', network: NETWORK, mapOnly: false });
    expect(screenOf(state({ view: 'map' }))).toEqual({ kind: 'network', network: NETWORK, mapOnly: true });
  });
});
