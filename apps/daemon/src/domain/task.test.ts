import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { DEFAULT_FAILURE_POLICY } from './failure.js';
import {
  answerDecision,
  approveGate,
  closeTask,
  setTrack,
  skipPhase,
  canSkipPhase,
  completePhase,
  createTask,
  currentPhaseId,
  failRun,
  openTask,
  recover,
  requestDecision,
  passChecks,
  rejectByChecks,
  resumeFromManual,
  sendBack,
  startRun,
  type Task,
} from './task.js';
import { checkpoint, failure, TASK_LIFECYCLE } from './test-fixtures.js';

const newTask = (overrides: Partial<Parameters<typeof createTask>[0]> = {}): Task =>
  createTask({ id: 't1', epicId: 'e1', title: 'Zoom', lifecycle: TASK_LIFECYCLE, ...overrides });

function runPhase(task: Task, sequence: number): Task {
  return completePhase(startRun(task, `run-${sequence}`), checkpoint(sequence, task.phaseIndex));
}

describe('a task going through its lifecycle', () => {
  it('starts as todo on the first phase, up to the PR by default', () => {
    const task = newTask();
    expect(task.status).toEqual({ kind: 'todo' });
    expect(currentPhaseId(task)).toBe('spec');
    expect(task.autonomy).toBe('up-to-pr');
  });

  it('walks every phase up to the PR with the default gates', () => {
    let task = openTask(newTask(), []);
    task = runPhase(task, 1);
    task = runPhase(task, 2);
    task = runPhase(task, 3);
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'plan-approval' });

    task = approveGate(task);
    task = runPhase(task, 4);
    task = runPhase(task, 5);
    task = runPhase(task, 6);
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'human-review' });

    task = runPhase(approveGate(task), 7);
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'merge' });
    expect(approveGate(task).status).toEqual({ kind: 'done' });
    expect(task.checkpoints.map((c) => c.phaseIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('asks for approval after every phase when going step by step', () => {
    const task = runPhase(openTask(newTask({ autonomy: 'step-by-step' }), []), 1);
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'phase-approval' });
  });

  it('goes straight from verification to done when allowed up to merge', () => {
    let task: Task = { ...openTask(newTask({ autonomy: 'up-to-merge' }), []), phaseIndex: 4 };
    task = runPhase(task, 1);
    task = runPhase(task, 2);
    task = runPhase(task, 3);
    expect(task.status).toEqual({ kind: 'done' });
  });

  it('walks the grill decisions one by one, then resumes the same phase session', () => {
    const task = requestDecision(startRun(openTask(newTask(), []), 'run-1'), 'd1');
    expect(task.status).toEqual({ kind: 'awaiting-decision', decisionId: 'd1' });

    const second = answerDecision(task, 'd2');
    expect(second.status).toEqual({ kind: 'awaiting-decision', decisionId: 'd2' });

    const resumed = answerDecision(second, null);
    expect(resumed.status).toEqual({ kind: 'ready', mode: 'resume' });
    expect(currentPhaseId(resumed)).toBe('spec');
  });

  it('sends a task back from review to execution', () => {
    const atReview: Task = { ...newTask(), phaseIndex: 5, status: { kind: 'awaiting-gate', gate: 'human-review' } };
    const back = sendBack(atReview, 'execute');
    expect(currentPhaseId(back)).toBe('execute');
    expect(back.status).toEqual({ kind: 'ready', mode: 'fresh' });
    expect(() => sendBack(atReview, 'merge')).toThrow(DomainError);
  });

  it('refuses transitions from the wrong status', () => {
    expect(() => startRun(newTask(), 'run-1')).toThrow(DomainError);
    expect(() => completePhase(openTask(newTask(), []), checkpoint(1, 0))).toThrow(DomainError);
  });

  it('refuses a checkpoint taken for another phase', () => {
    expect(() => completePhase(startRun(openTask(newTask(), []), 'run-1'), checkpoint(1, 3))).toThrow(DomainError);
  });
});

describe('dependencies', () => {
  it('opens only once every dependency is done', () => {
    const task = newTask({ dependsOn: ['t0'] });
    const pending = { ...newTask({ id: 't0' }) };
    const done: Task = { ...pending, status: { kind: 'done' } };
    expect(() => openTask(task, [pending])).toThrow(/waits for t0/);
    expect(openTask(task, [done]).status).toEqual({ kind: 'ready', mode: 'fresh' });
  });
});

describe('failures and recovery', () => {
  const running = (): Task => startRun(openTask(newTask(), []), 'run-1');

  it('retries automatically once, then blocks with the failure', () => {
    const retried = failRun(running(), failure(), DEFAULT_FAILURE_POLICY);
    expect(retried.status).toEqual({ kind: 'ready', mode: 'retry' });

    const blocked = failRun(startRun(retried, 'run-2'), failure(), DEFAULT_FAILURE_POLICY);
    expect(blocked.status).toEqual({ kind: 'blocked', failure: failure() });
  });

  it('forgets failures when the phase changes', () => {
    const retried = failRun(running(), failure(), DEFAULT_FAILURE_POLICY);
    const next = completePhase(startRun(retried, 'run-2'), checkpoint(1, 0));
    expect(next.failuresInPhase).toEqual([]);
  });

  const blocked = (): Task => {
    let task = runPhase(openTask(newTask(), []), 1);
    task = runPhase(task, 2);
    task = startRun(task, 'run-3');
    task = failRun(task, failure('quota-exhausted'), DEFAULT_FAILURE_POLICY);
    return task;
  };

  it('restarts from the checkpoint with a summary, or resumes the session, with a clean failure count', () => {
    const restarted = recover(blocked(), 'restart-from-checkpoint');
    const resumed = recover(blocked(), 'resume-session');

    expect(restarted.status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(resumed.status).toEqual({ kind: 'ready', mode: 'resume' });
    for (const recovered of [restarted, resumed]) {
      expect(recovered.failuresInPhase).toEqual([]);
      expect(currentPhaseId(recovered)).toBe('plan');
    }
  });

  it('rewinds to the phase after a checkpoint and drops later checkpoints', () => {
    const rewound = recover(blocked(), 'rewind', 1);
    expect(currentPhaseId(rewound)).toBe('grill');
    expect(rewound.checkpoints.map((c) => c.sequence)).toEqual([1]);
    expect(() => recover(blocked(), 'rewind', 9)).toThrow(DomainError);
  });

  it('hands the task over and takes it back', () => {
    const manual = recover(blocked(), 'take-over');
    expect(manual.status).toEqual({ kind: 'manual' });
    expect(resumeFromManual(manual).status).toEqual({ kind: 'ready', mode: 'fresh' });
  });
});

describe('verification cycles', () => {
  const verifying = (extra: Partial<Task> = {}): Task => ({ ...newTask(), phaseIndex: 4, status: { kind: 'running', runId: 'r' }, ...extra });

  it('sends a red verification back to the fix phase with the failure as diagnosis', () => {
    const task = rejectByChecks(verifying(), failure('check-failed', 'check:test'), 'execute', DEFAULT_FAILURE_POLICY);
    expect(currentPhaseId(task)).toBe('execute');
    expect(task.status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(task.failuresInPhase).toEqual([failure('check-failed', 'check:test')]);
    expect(task.checkFailures).toHaveLength(1);
  });

  it('blocks when the same check fails cycle after cycle', () => {
    const seen = [failure('check-failed', 'check:test'), failure('check-failed', 'check:test')];
    const task = rejectByChecks(verifying({ checkFailures: seen }), failure('check-failed', 'check:test'), 'execute', DEFAULT_FAILURE_POLICY);
    expect(task.status.kind).toBe('blocked');
  });

  it('blocks after too many cycles even when the failing check changes', () => {
    const seen = ['a', 'b', 'c'].map((name) => failure('check-failed', `check:${name}`));
    const task = rejectByChecks(verifying({ checkFailures: seen }), failure('check-failed', 'check:d'), 'execute', DEFAULT_FAILURE_POLICY);
    expect(task.status.kind).toBe('blocked');
  });

  it('forgets past cycles once verification passes', () => {
    const task = passChecks(verifying({ checkFailures: [failure()] }), checkpoint(1, 4));
    expect(task.checkFailures).toEqual([]);
    expect(currentPhaseId(task)).toBe('review');
  });
});

describe('closing without merge', () => {
  it('closes an open task from any waiting status, with its reason and evidence', () => {
    for (const status of [{ kind: 'todo' }, { kind: 'ready', mode: 'fresh' }, { kind: 'awaiting-gate', gate: 'merge' }, { kind: 'blocked', failure: failure() }, { kind: 'manual' }] as const) {
      expect(closeTask({ ...newTask(), status }, 'already-done', 'Merged in #26').status).toEqual({ kind: 'closed', reason: 'already-done', evidence: 'Merged in #26' });
    }
  });

  it('refuses to close a running, merged or already closed task', () => {
    expect(() => closeTask({ ...newTask(), status: { kind: 'running', runId: 'r' } }, 'obsolete', '')).toThrow(/interrupt it before closing/);
    expect(() => closeTask({ ...newTask(), status: { kind: 'done' } }, 'obsolete', '')).toThrow(DomainError);
    expect(() => closeTask({ ...newTask(), status: { kind: 'closed', reason: 'duplicate', evidence: '' } }, 'obsolete', '')).toThrow(DomainError);
  });

  it('lets dependants open after a dependency closed as done elsewhere, not after an abandoned one', () => {
    const dependant = newTask({ id: 't2', dependsOn: ['t1'] });
    const doneElsewhere = closeTask(newTask(), 'already-done', '#26');
    const abandoned = closeTask(newTask(), 'abandoned', '');
    expect(openTask(dependant, [doneElsewhere]).status).toEqual({ kind: 'ready', mode: 'fresh' });
    expect(() => openTask(dependant, [abandoned])).toThrow(/waits for t1/);
  });
});

describe('tracks and skipped phases', () => {
  const FLEXIBLE = {
    ...TASK_LIFECYCLE,
    phases: TASK_LIFECYCLE.phases.map((phase) =>
      ['grill', 'plan'].includes(phase.id)
        ? { ...phase, tracks: ['standard' as const], skippable: true }
        : ['spec', 'review'].includes(phase.id)
          ? { ...phase, skippable: true }
          : phase,
    ),
  };
  const flexible = (extra: Partial<Task> = {}): Task => ({ ...newTask({ lifecycle: FLEXIBLE }), ...extra });

  it('walks the light track without grill and plan', () => {
    let task = openTask(flexible({ track: 'light' }), []);
    task = runPhase(task, 1);
    expect(currentPhaseId(task)).toBe('execute');
  });

  it('switches track on the way, jumping over phases the new track drops', () => {
    const atGrill = flexible({ phaseIndex: 1, status: { kind: 'ready', mode: 'fresh' } });
    expect(currentPhaseId(setTrack(atGrill, 'light'))).toBe('execute');
    const atExecute = flexible({ phaseIndex: 3, status: { kind: 'ready', mode: 'fresh' }, track: 'light' });
    expect(currentPhaseId(setTrack(atExecute, 'standard'))).toBe('execute');
    expect(setTrack(flexible(), 'light').status).toEqual({ kind: 'todo' });
  });

  it('refuses a track change while running or once finished', () => {
    expect(() => setTrack(flexible({ status: { kind: 'running', runId: 'r' } }), 'light')).toThrow(DomainError);
    expect(() => setTrack(flexible({ status: { kind: 'done' } }), 'light')).toThrow(DomainError);
  });

  it('skips only skippable phases, and not while running or before opening', () => {
    expect(currentPhaseId(skipPhase(flexible({ phaseIndex: 5, status: { kind: 'awaiting-gate', gate: 'human-review' } })))).toBe('merge');
    expect(() => skipPhase(flexible({ phaseIndex: 4, status: { kind: 'ready', mode: 'fresh' } }))).toThrow(/verify cannot be skipped/);
    expect(() => skipPhase(flexible({ phaseIndex: 0, status: { kind: 'running', runId: 'r' } }))).toThrow(DomainError);
    expect(canSkipPhase(flexible())).toBe(false);
  });

  it('never sends a light task back to a phase outside its track', () => {
    const atReview = flexible({ track: 'light', phaseIndex: 5, status: { kind: 'awaiting-gate', gate: 'human-review' } });
    expect(() => sendBack(atReview, 'plan')).toThrow(/not part of the light track/);
    expect(currentPhaseId(sendBack(atReview, 'execute'))).toBe('execute');
  });
});
