import { describe, expect, it } from 'vitest';
import { buildInbox } from './inbox.js';
import { createTask, type Task, type TaskStatus } from './task.js';
import { failure, TASK_LIFECYCLE } from './test-fixtures.js';

const task = (id: string, status: TaskStatus, dependsOn: string[] = []): Task => ({
  ...createTask({ id, epicId: `epic-${id}`, title: id, lifecycle: TASK_LIFECYCLE, dependsOn }),
  status,
});

describe('buildInbox', () => {
  it('lists only what waits for the human, blocked first, then by work unblocked', () => {
    const tasks = [
      task('review', { kind: 'awaiting-gate', gate: 'human-review' }),
      task('grill', { kind: 'awaiting-decision', decisionId: 'd1' }),
      task('stuck', { kind: 'blocked', failure: failure() }),
      task('busy', { kind: 'running', runId: 'r' }),
      task('later1', { kind: 'todo' }, ['grill']),
      task('later2', { kind: 'todo' }, ['grill']),
    ];

    expect(buildInbox(tasks)).toEqual([
      { taskId: 'stuck', epicId: 'epic-stuck', reason: { kind: 'blocked' }, unblocks: 0 },
      { taskId: 'grill', epicId: 'epic-grill', reason: { kind: 'decision', decisionId: 'd1' }, unblocks: 2 },
      { taskId: 'review', epicId: 'epic-review', reason: { kind: 'gate', gate: 'human-review' }, unblocks: 0 },
    ]);
  });
});
