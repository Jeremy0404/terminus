import { describe, expect, it } from 'vitest';
import { suggestedActions } from './suggestions.js';
import { createTask, type Task, type TaskStatus } from './task.js';
import { checkpoint, failure, TASK_LIFECYCLE } from './test-fixtures.js';

const task = (status: TaskStatus, extra: Partial<Task> = {}): Task => ({
  ...createTask({ id: 't', epicId: 'e', title: 't', lifecycle: TASK_LIFECYCLE }),
  status,
  ...extra,
});

describe('suggestedActions', () => {
  it('offers to start the current phase of a ready task', () => {
    expect(suggestedActions(task({ kind: 'ready', mode: 'fresh' }, { phaseIndex: 2 }), [])).toEqual([{ kind: 'start-phase', phaseId: 'plan' }]);
  });

  it('offers nothing for a todo task whose dependencies are pending', () => {
    const waiting = { ...task({ kind: 'todo' }), dependsOn: ['other'] };
    expect(suggestedActions(waiting, [])).toEqual([]);
    expect(suggestedActions(task({ kind: 'todo' }), [])).toEqual([{ kind: 'open-task' }]);
  });

  it('offers approve or send back at a gate, and merge at the merge gate', () => {
    expect(suggestedActions(task({ kind: 'awaiting-gate', gate: 'human-review' }), [])).toEqual([
      { kind: 'approve', gate: 'human-review' },
      { kind: 'send-back' },
    ]);
    expect(suggestedActions(task({ kind: 'awaiting-gate', gate: 'merge' }), [])).toEqual([{ kind: 'merge' }]);
  });

  it('offers every recovery with restart from checkpoint as the default', () => {
    const blocked = task({ kind: 'blocked', failure: failure() }, { checkpoints: [checkpoint(1, 0)] });
    expect(suggestedActions(blocked, [])).toEqual([
      { kind: 'recover', option: 'restart-from-checkpoint', isDefault: true },
      { kind: 'recover', option: 'resume-session', isDefault: false },
      { kind: 'recover', option: 'rewind', isDefault: false },
      { kind: 'recover', option: 'take-over', isDefault: false },
      { kind: 'split-task' },
    ]);
  });

  it('hides rewind when there is no checkpoint to go back to', () => {
    const blocked = task({ kind: 'blocked', failure: failure() });
    expect(suggestedActions(blocked, []).some((action) => action.kind === 'recover' && action.option === 'rewind')).toBe(false);
  });
});
