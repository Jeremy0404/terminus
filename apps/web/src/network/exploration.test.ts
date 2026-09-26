import { describe, expect, it } from 'vitest';
import { NETWORK, task } from '../test/fixtures';
import type { EpicDto } from '@terminus/contracts';
import { explore, finishedLine, routeTo } from './exploration';

describe('network exploration', () => {
  it('includes transitive dependencies across lines, keeps finished context and stops at cycles', () => {
    const tasks = [task('a', 'engine', 'A', { kind: 'done' }, { dependsOn: ['c'] }), task('b', 'engine', 'B', { kind: 'todo' }, { dependsOn: ['a'] }), task('c', 'ui', 'C', { kind: 'todo' }, { dependsOn: ['b'] }), task('d', 'other', 'D', { kind: 'todo' })];
    expect([...routeTo(tasks, 'ui')].sort()).toEqual(['a', 'b', 'c']);
  });
  it('filters unfinished work and searches full titles and descriptions', () => {
    expect(explore(NETWORK, 'remaining', '', '').tasks.map((item) => item.id)).toEqual(['m2', 'i1', 'i2']);
    expect(explore(NETWORK, 'all', '', 'UNE COULEUR').tasks.map((item) => item.id)).toEqual(['i1']);
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
