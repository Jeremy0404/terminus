import { describe, expect, it } from 'vitest';
import { assertAcyclic, dependenciesMet, pickRunnable, unblockCount } from './scheduling.js';
import { createTask, type Task, type TaskStatus } from './task.js';
import { DomainError } from './errors.js';
import { TASK_LIFECYCLE } from './test-fixtures.js';

const task = (id: string, status: TaskStatus, dependsOn: string[] = []): Task => ({
  ...createTask({ id, epicId: 'e', title: id, lifecycle: TASK_LIFECYCLE, dependsOn }),
  status,
});
const ready: TaskStatus = { kind: 'ready', retry: false };
const todo: TaskStatus = { kind: 'todo' };

describe('unblockCount', () => {
  it('counts every unfinished task transitively waiting on this one', () => {
    const tasks = [task('a', ready), task('b', todo, ['a']), task('c', todo, ['b']), task('d', { kind: 'done' }, ['a'])];
    expect(unblockCount('a', tasks)).toBe(2);
    expect(unblockCount('c', tasks)).toBe(0);
  });
});

describe('dependenciesMet', () => {
  it('needs every dependency done', () => {
    const tasks = [task('a', { kind: 'done' }), task('b', ready), task('c', todo, ['a', 'b'])];
    expect(dependenciesMet(tasks[2] as Task, tasks)).toBe(false);
    expect(dependenciesMet(task('d', todo, ['a']), tasks)).toBe(true);
  });
});

describe('assertAcyclic', () => {
  it('rejects a dependency cycle', () => {
    expect(() => assertAcyclic([task('a', todo, ['c']), task('b', todo, ['a']), task('c', todo, ['b'])])).toThrow(DomainError);
    expect(() => assertAcyclic([task('a', todo), task('b', todo, ['a'])])).not.toThrow();
  });
});

describe('pickRunnable', () => {
  it('fills the free slots with ready tasks that unblock the most work', () => {
    const tasks = [
      task('running', { kind: 'running', runId: 'r' }),
      task('x', ready),
      task('y', ready),
      task('z', todo, ['y']),
      task('w', todo, ['y']),
    ];
    expect(pickRunnable(tasks, 2).map((t) => t.id)).toEqual(['y']);
    expect(pickRunnable(tasks, 3).map((t) => t.id)).toEqual(['y', 'x']);
    expect(pickRunnable(tasks, 1)).toEqual([]);
  });
});
