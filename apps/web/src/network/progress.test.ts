import { describe, expect, it } from 'vitest';
import { task } from '../test/fixtures';
import { availableTasks, progressOf } from './progress';

describe('product progress', () => {
  it('credits completed work without counting abandoned, obsolete or duplicate tasks as delivered', () => {
    const tasks = [task('merged', 'line', 'Merged', { kind: 'done' }), task('running', 'line', 'Running', { kind: 'running', runId: 'r' }), task('todo', 'line', 'Todo', { kind: 'todo' }),
      ...(['already-done', 'abandoned', 'obsolete', 'duplicate'] as const).map((reason) => task(reason, 'line', reason, { kind: 'closed', reason, evidence: 'PR #42' }))];
    expect(progressOf(tasks)).toEqual({ integrated: 1, existing: 1, active: 1, todo: 1, abandoned: 1, obsolete: 1, duplicate: 1 });
  });

  it('only offers tasks with satisfied dependencies, including work completed elsewhere', () => {
    const tasks = [
      task('external', 'line', 'External', { kind: 'closed', reason: 'already-done', evidence: 'PR #42' }),
      task('abandoned', 'line', 'Abandoned', { kind: 'closed', reason: 'abandoned', evidence: '' }),
      task('available', 'line', 'Available', { kind: 'todo' }, { dependsOn: ['external'] }),
      task('blocked', 'line', 'Blocked', { kind: 'todo' }, { dependsOn: ['abandoned'] }),
      task('missing', 'line', 'Missing', { kind: 'todo' }, { dependsOn: ['unknown'] }),
    ];
    expect(availableTasks(tasks).map((item) => item.id)).toEqual(['available']);
  });
});
