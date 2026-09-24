import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryAppRepository,
  InMemoryDecisionRepository,
  InMemoryEpicRepository,
  InMemoryRunRepository,
  InMemoryTaskRepository,
} from '../adapters/in-memory/in-memory-repositories.js';
import { FakeCodeHost, FakeWorkspace, FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import type { Decision } from '../domain/decision.js';
import type { TaskWorkspace } from './ports/workspace.js';
import { createTask, type Task, type TaskStatus } from '../domain/task.js';
import { checkpoint, failure, TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import { TaskActions } from './task-actions.js';

class RewindRecordingWorkspace extends FakeWorkspace {
  readonly rewinds: string[] = [];
  override rewind(_workspace: TaskWorkspace, ref: string): void {
    this.rewinds.push(ref);
  }
}

let tasks: InMemoryTaskRepository;
let decisions: InMemoryDecisionRepository;
let runs: InMemoryRunRepository;
let workspace: RewindRecordingWorkspace;
let codeHost: FakeCodeHost;
let bus: RecordingBus;
let actions: TaskActions;

beforeEach(() => {
  const apps = new InMemoryAppRepository();
  const epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  decisions = new InMemoryDecisionRepository();
  runs = new InMemoryRunRepository();
  workspace = new RewindRecordingWorkspace();
  codeHost = new FakeCodeHost();
  bus = new RecordingBus();
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', verification: [], createdAt: '2026-09-24T09:00:00Z' });
  epics.save({ id: 'epic', appId: 'app', code: 'I', name: 'Interface', status: 'active', position: 1 });
  actions = new TaskActions({ apps, epics, tasks, runs, decisions, workspace, codeHost, clock: new FixedClock(), ids: new SequentialIds(), bus, baseRef: 'main' });
});

function givenTask(id: string, status: TaskStatus, extra: Partial<Task> = {}): Task {
  const task = { ...createTask({ id, epicId: 'epic', title: id, lifecycle: TASK_LIFECYCLE }), status, ...extra };
  tasks.save(task);
  return task;
}

function givenDecision(id: string): Decision {
  const decision: Decision = {
    id, kind: 'question', taskId: 't1', phaseIndex: 1, question: `Question ${id}`,
    options: [{ label: 'A', description: 'a', recommended: true }, { label: 'B', description: 'b', recommended: false }],
    answer: null, createdAt: '2026-09-24T09:00:00Z', answeredAt: null,
  };
  decisions.save(decision);
  return decision;
}

describe('TaskActions', () => {
  it('opens a task once its dependencies are done', () => {
    givenTask('dep', { kind: 'done' });
    givenTask('t1', { kind: 'todo' }, { dependsOn: ['dep'] });
    expect(actions.open('t1').status).toEqual({ kind: 'ready', mode: 'fresh' });
  });

  it('records answers and walks to the next open decision, then resumes the phase', () => {
    givenDecision('d1');
    givenDecision('d2');
    givenTask('t1', { kind: 'awaiting-decision', decisionId: 'd1' }, { phaseIndex: 1 });

    expect(actions.answer('d1', { kind: 'option', index: 0 }).status).toEqual({ kind: 'awaiting-decision', decisionId: 'd2' });
    expect(decisions.get('d1')?.answer).toEqual({ kind: 'option', index: 0 });
    expect(decisions.get('d1')?.answeredAt).toBe('2026-09-24T10:00:00.000Z');

    expect(actions.answer('d2', { kind: 'other', text: 'Both' }).status).toEqual({ kind: 'ready', mode: 'resume' });
  });

  it('refuses an answer to a decision the task is not waiting on, or an unknown option', () => {
    givenDecision('d1');
    givenDecision('d2');
    givenTask('t1', { kind: 'awaiting-decision', decisionId: 'd1' }, { phaseIndex: 1 });
    expect(() => actions.answer('d2', { kind: 'option', index: 0 })).toThrow(/not waiting on decision d2/);
    expect(() => actions.answer('d1', { kind: 'option', index: 5 })).toThrow(/no option 5/);
  });

  it('approves a gate and sends a review back to execution', () => {
    givenTask('t1', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 2 });
    expect(actions.approve('t1').phaseIndex).toBe(3);

    givenTask('t2', { kind: 'awaiting-gate', gate: 'human-review' }, { phaseIndex: 5 });
    expect(actions.sendBack('t2', 'execute').phaseIndex).toBe(3);
  });

  it('restarts from the last checkpoint by resetting the worktree to it', () => {
    givenTask('t1', { kind: 'blocked', failure: failure() }, { phaseIndex: 3, checkpoints: [checkpoint(1, 0), checkpoint(2, 1)] });
    expect(actions.recover('t1', 'restart-from-checkpoint').status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(workspace.rewinds).toEqual(['refs/terminus/checkpoints/t/2']);
  });

  it('restarts from the branch head when no checkpoint exists yet', () => {
    givenTask('t1', { kind: 'blocked', failure: failure() });
    actions.recover('t1', 'restart-from-checkpoint');
    expect(workspace.rewinds).toEqual(['HEAD']);
  });

  it('rewinds to an older checkpoint, and resumes a session without touching files', () => {
    givenTask('t1', { kind: 'blocked', failure: failure() }, { phaseIndex: 3, checkpoints: [checkpoint(1, 0), checkpoint(2, 1)] });
    expect(actions.recover('t1', 'rewind', 1).phaseIndex).toBe(1);
    expect(workspace.rewinds).toEqual(['refs/terminus/checkpoints/t/1']);

    givenTask('t2', { kind: 'blocked', failure: failure() });
    actions.recover('t2', 'resume-session');
    expect(workspace.rewinds).toHaveLength(1);
  });

  it('hands over with the command to resume the last session in a terminal', () => {
    givenTask('t1', { kind: 'blocked', failure: failure() });
    runs.save({ id: 'r1', taskId: 't1', phaseIndex: 0, sessionId: 'abc-123', status: 'failed', startedAt: 'x', endedAt: 'y', usage: null, output: null });

    const { task, command } = actions.takeOver('t1');

    expect(task.status).toEqual({ kind: 'manual' });
    expect(command).toBe('cd /worktrees/app/t1 && claude --resume abc-123');
    expect(actions.resumeFromManual('t1').status).toEqual({ kind: 'ready', mode: 'fresh' });
  });

  const atMergeGate = (): Task => {
    const task = givenTask('t1', { kind: 'awaiting-gate', gate: 'merge' }, { phaseIndex: 6 });
    runs.save({ id: 'publish', taskId: 't1', phaseIndex: 6, sessionId: 'code-host', status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null,
      output: { pullRequest: { number: 42, url: 'u' } } });
    return task;
  };

  describe('merge', () => {
    it('merges once CI is green and completes the task', () => {
      atMergeGate();
      expect(actions.merge('t1').status).toEqual({ kind: 'done' });
      expect(codeHost.merged).toEqual([42]);
    });

    it('merges a repository without CI', () => {
      atMergeGate();
      codeHost.checksState = 'none';
      expect(actions.merge('t1').status).toEqual({ kind: 'done' });
    });

    it.each(['pending', 'failure'] as const)('refuses while CI is %s', (state) => {
      atMergeGate();
      codeHost.checksState = state;
      expect(() => actions.merge('t1')).toThrow(`CI on pull request #42 is ${state}`);
      expect(codeHost.merged).toEqual([]);
    });

    it('sends a branch that fell behind the base back to sync instead of merging', () => {
      const withSync = { ...TASK_LIFECYCLE, phases: [...TASK_LIFECYCLE.phases.slice(0, 6), { id: 'sync', executor: 'sync' as const }, ...TASK_LIFECYCLE.phases.slice(6)] };
      givenTask('t1', { kind: 'awaiting-gate', gate: 'merge' }, { phaseIndex: 7, lifecycle: withSync });
      runs.save({ id: 'publish', taskId: 't1', phaseIndex: 7, sessionId: 'code-host', status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, output: { pullRequest: { number: 42, url: 'u' } } });
      workspace.behind = true;

      const task = actions.merge('t1');

      expect(task.phaseIndex).toBe(6);
      expect(task.status).toEqual({ kind: 'ready', mode: 'fresh' });
      expect(codeHost.merged).toEqual([]);
    });

    it('explains a merge GitHub refuses instead of failing with an internal error', () => {
      atMergeGate();
      codeHost.merge = () => {
        throw Object.assign(new Error('Command failed'), { stderr: 'the merge commit cannot be cleanly created' });
      };
      expect(() => actions.merge('t1')).toThrow('GitHub refused to merge pull request #42: the merge commit cannot be cleanly created');
    });

    it('does not let a plain approval skip the merge', () => {
      atMergeGate();
      expect(() => actions.approve('t1')).toThrow(/merged with merge/);
    });
  });

  describe('close', () => {
    it('closes the task, removes its worktree and closes its pull request', () => {
      givenTask('t1', { kind: 'awaiting-gate', gate: 'merge' }, { phaseIndex: 6 });
      runs.save({ id: 'publish', taskId: 't1', phaseIndex: 6, sessionId: 'code-host', status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, output: { pullRequest: { number: 27, url: 'u' } } });

      const { task, warnings } = actions.close('t1', 'already-done', 'Covered by #26');

      expect(task.status).toEqual({ kind: 'closed', reason: 'already-done', evidence: 'Covered by #26' });
      expect(workspace.removed).toEqual(['t1']);
      expect(codeHost.closed).toEqual([{ number: 27, comment: 'Closed from Terminus (already-done): Covered by #26' }]);
      expect(warnings).toEqual([]);
    });

    it('closes a task that never published anything', () => {
      givenTask('t1', { kind: 'todo' });
      expect(actions.close('t1', 'obsolete', '').task.status.kind).toBe('closed');
      expect(codeHost.closed).toEqual([]);
    });

    it('still closes the task when GitHub refuses to close the pull request, and says so', () => {
      givenTask('t1', { kind: 'awaiting-gate', gate: 'merge' }, { phaseIndex: 6 });
      runs.save({ id: 'publish', taskId: 't1', phaseIndex: 6, sessionId: 'code-host', status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null, output: { pullRequest: { number: 27, url: 'u' } } });
      codeHost.close = () => {
        throw new Error('network down');
      };

      const { task, warnings } = actions.close('t1', 'abandoned', '');

      expect(task.status.kind).toBe('closed');
      expect(warnings).toEqual(['Pull request #27 could not be closed: Error: network down']);
    });
  });

  describe('checks', () => {
    it.each(['success', 'none', 'pending', 'failure'] as const)('reads the pull request checks state %s', (state) => {
      atMergeGate();
      codeHost.checksState = state;
      expect(actions.checks('t1')).toBe(state);
    });

    it('throws when the task has no published pull request yet', () => {
      givenTask('t1', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 2 });
      expect(() => actions.checks('t1')).toThrow(/has no pull request/);
    });

    it('does not save the task or publish on the bus', () => {
      atMergeGate();
      bus.updates.length = 0;
      actions.checks('t1');
      expect(bus.updates).toEqual([]);
    });
  });

  describe('track and skips', () => {
    const FLEXIBLE = {
      ...TASK_LIFECYCLE,
      phases: TASK_LIFECYCLE.phases.map((phase) =>
        ['grill', 'plan'].includes(phase.id) ? { ...phase, tracks: ['standard' as const], skippable: true } : phase.id === 'spec' ? { ...phase, skippable: true } : phase,
      ),
    };

    it('switches to the light track, moves past phases it drops, and records the deviation', () => {
      givenTask('t1', { kind: 'ready', mode: 'fresh' }, { phaseIndex: 1, lifecycle: FLEXIBLE });

      const task = actions.changeTrack('t1', 'light');

      expect(task.track).toBe('light');
      expect(task.phaseIndex).toBe(3);
      expect(decisions.listByTask('t1')).toEqual([expect.objectContaining({ kind: 'deviation', question: 'Track changed from standard to light', answer: { kind: 'other', text: 'Decided by the human' } })]);
    });

    it('skips a skippable phase and records it, and refuses the others', () => {
      givenTask('t1', { kind: 'awaiting-gate', gate: 'plan-approval' }, { phaseIndex: 2, lifecycle: FLEXIBLE });
      expect(actions.skip('t1').phaseIndex).toBe(3);
      expect(decisions.listByTask('t1')[0]).toMatchObject({ kind: 'deviation', question: 'Phase plan skipped' });

      givenTask('t2', { kind: 'ready', mode: 'fresh' }, { phaseIndex: 4, lifecycle: FLEXIBLE });
      expect(() => actions.skip('t2')).toThrow(/Phase verify cannot be skipped/);
    });
  });
});
