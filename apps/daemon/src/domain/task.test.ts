import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { DEFAULT_FAILURE_POLICY } from './failure.js';
import {
  answerDecision,
  approveGate,
  completePhase,
  createTask,
  currentPhaseId,
  failRun,
  openTask,
  recover,
  requestDecision,
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
