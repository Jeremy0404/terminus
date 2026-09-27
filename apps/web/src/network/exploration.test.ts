import { describe, expect, it } from 'vitest';
import { NETWORK, task } from '../test/fixtures';
import type { EpicDto, NetworkDto } from '@terminus/contracts';
import { explore, finishedLine } from './exploration';

describe('network exploration', () => {
  const ids = (network: NetworkDto) => network.tasks.map((item) => item.id);

  it('keeps every station and every line without a search term', () => {
    const empty: EpicDto = { id: 'empty', appId: 'app-1', code: 'E', name: 'Vide', status: 'active', position: 3, description: '', breakdown: { status: 'idle' } };
    const visible = explore({ ...NETWORK, epics: [...NETWORK.epics, empty] }, '');
    expect(ids(visible)).toEqual(['m1', 'm2', 'i1', 'i2']);
    expect(visible.epics.map((epic) => epic.id)).toEqual(['engine', 'ui', 'empty']);
  });

  it('searches titles and descriptions, ignoring case and surrounding spaces', () => {
    expect(ids(explore(NETWORK, 'UNE COULEUR'))).toEqual(['i1']);
    expect(ids(explore(NETWORK, '  zoom '))).toEqual(['i2']);
  });

  it('keeps only the lines with a match while searching', () => {
    expect(explore(NETWORK, 'UNE COULEUR').epics.map((epic) => epic.id)).toEqual(['ui']);
  });
});

describe('finishedLine', () => {
  const line = (status: EpicDto['status'] = 'active'): EpicDto => ({ id: 'a', appId: 'app-1', code: 'A', name: 'a', status, position: 1, description: '', breakdown: { status: 'idle' } });
  const done = task('a1', 'a', 'A1', { kind: 'done' });
  const closed = task('a2', 'a', 'A2', { kind: 'closed', reason: 'already-done', evidence: '' });

  it('is finished when delivered, even without stations', () => {
    expect(finishedLine(line('delivered'), [])).toBe(true);
  });

  it('is finished when every station is done or closed', () => {
    expect(finishedLine(line(), [done, closed])).toBe(true);
  });

  it('is not finished while empty or with one unfinished station', () => {
    expect(finishedLine(line(), [])).toBe(false);
    expect(finishedLine(line(), [done, task('a3', 'a', 'A3', { kind: 'todo' })])).toBe(false);
  });

  it('only looks at its own stations', () => {
    expect(finishedLine(line(), [done, task('b1', 'b', 'B1', { kind: 'todo' })])).toBe(true);
  });
});
