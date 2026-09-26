import { describe, expect, it } from 'vitest';
import { NETWORK, task } from '../test/fixtures';
import { explore, routeTo } from './exploration';

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
