import type { Checkpoint } from './checkpoint.js';
import type { Failure } from './failure.js';
import type { LifecycleDefinition } from './lifecycle.js';

export const TASK_LIFECYCLE: LifecycleDefinition = {
  id: 'task',
  version: 'test',
  phases: [
    { id: 'spec' },
    { id: 'grill' },
    { id: 'plan', gate: 'plan-approval' },
    { id: 'execute' },
    { id: 'verify' },
    { id: 'review', gate: 'human-review' },
    { id: 'merge', gate: 'merge' },
  ],
};

export function checkpoint(sequence: number, phaseIndex: number): Checkpoint {
  return { sequence, phaseIndex, ref: `refs/terminus/checkpoints/t/${sequence}`, sessionId: `s-${sequence}`, takenAt: '2026-09-24T10:00:00Z' };
}

export function failure(kind: Failure['kind'] = 'check-failed', signature = 'zoom.spec.ts'): Failure {
  return { kind, signature, message: `${signature} failed`, at: '2026-09-24T10:00:00Z' };
}
