import type { Checkpoint } from './checkpoint.js';
import { DomainError } from './errors.js';
import { decideAfterFailure, type Failure, type FailurePolicy } from './failure.js';
import {
  isLastPhase,
  phaseAt,
  phaseIndexOf,
  requiresHuman,
  type Autonomy,
  type GateKind,
  type LifecycleDefinition,
} from './lifecycle.js';

export type RecoveryOption = 'restart-from-checkpoint' | 'resume-session' | 'rewind' | 'take-over';

export const DEFAULT_RECOVERY: RecoveryOption = 'restart-from-checkpoint';

export type RunMode = 'fresh' | 'retry' | 'resume';

export type TaskStatus =
  | { readonly kind: 'todo' }
  | { readonly kind: 'ready'; readonly mode: RunMode }
  | { readonly kind: 'running'; readonly runId: string }
  | { readonly kind: 'awaiting-decision'; readonly decisionId: string }
  | { readonly kind: 'awaiting-gate'; readonly gate: GateKind | 'phase-approval' }
  | { readonly kind: 'blocked'; readonly failure: Failure }
  | { readonly kind: 'manual' }
  | { readonly kind: 'done' };

export interface Task {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly lifecycle: LifecycleDefinition;
  readonly autonomy: Autonomy;
  readonly dependsOn: readonly string[];
  readonly phaseIndex: number;
  readonly status: TaskStatus;
  readonly failuresInPhase: readonly Failure[];
  readonly checkpoints: readonly Checkpoint[];
}

export interface NewTask {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly lifecycle: LifecycleDefinition;
  readonly autonomy?: Autonomy;
  readonly dependsOn?: readonly string[];
}

export function createTask(input: NewTask): Task {
  if (input.lifecycle.phases.length === 0) throw new DomainError(`Lifecycle ${input.lifecycle.id} has no phases`);
  return {
    id: input.id,
    epicId: input.epicId,
    title: input.title,
    lifecycle: input.lifecycle,
    autonomy: input.autonomy ?? 'up-to-pr',
    dependsOn: input.dependsOn ?? [],
    phaseIndex: 0,
    status: { kind: 'todo' },
    failuresInPhase: [],
    checkpoints: [],
  };
}

export function currentPhaseId(task: Task): string {
  return phaseAt(task.lifecycle, task.phaseIndex).id;
}

export function openTask(task: Task, dependencies: readonly Task[]): Task {
  expectStatus(task, 'todo');
  const pending = task.dependsOn.filter((id) => dependencies.find((dep) => dep.id === id)?.status.kind !== 'done');
  if (pending.length > 0) throw new DomainError(`Task ${task.id} waits for ${pending.join(', ')}`);
  return { ...task, status: { kind: 'ready', mode: 'fresh' } };
}

export function startRun(task: Task, runId: string): Task {
  expectStatus(task, 'ready');
  return { ...task, status: { kind: 'running', runId } };
}

export function requestDecision(task: Task, decisionId: string): Task {
  expectStatus(task, 'running');
  return { ...task, status: { kind: 'awaiting-decision', decisionId } };
}

export function answerDecision(task: Task, nextDecisionId: string | null): Task {
  expectStatus(task, 'awaiting-decision');
  if (nextDecisionId) return { ...task, status: { kind: 'awaiting-decision', decisionId: nextDecisionId } };
  return { ...task, status: { kind: 'ready', mode: 'resume' } };
}

export function completePhase(task: Task, checkpoint: Checkpoint): Task {
  expectStatus(task, 'running');
  if (checkpoint.phaseIndex !== task.phaseIndex) {
    throw new DomainError(`Checkpoint for phase ${checkpoint.phaseIndex} cannot complete phase ${task.phaseIndex}`);
  }
  const withCheckpoint = { ...task, checkpoints: [...task.checkpoints, checkpoint] };
  const phase = phaseAt(task.lifecycle, task.phaseIndex);
  if (requiresHuman(phase, task.autonomy)) {
    return { ...withCheckpoint, status: { kind: 'awaiting-gate', gate: phase.gate ?? 'phase-approval' } };
  }
  return advance(withCheckpoint);
}

export function approveGate(task: Task): Task {
  expectStatus(task, 'awaiting-gate');
  return advance(task);
}

export function sendBack(task: Task, toPhaseId: string): Task {
  expectStatus(task, 'awaiting-gate');
  const target = phaseIndexOf(task.lifecycle, toPhaseId);
  if (target >= task.phaseIndex) throw new DomainError(`Cannot send task ${task.id} forward to ${toPhaseId}`);
  return enterPhase(task, target);
}

export function failRun(task: Task, failure: Failure, policy: FailurePolicy): Task {
  expectStatus(task, 'running');
  const failuresInPhase = [...task.failuresInPhase, failure];
  const status: TaskStatus =
    decideAfterFailure(failuresInPhase, policy) === 'retry' ? { kind: 'ready', mode: 'retry' } : { kind: 'blocked', failure };
  return { ...task, failuresInPhase, status };
}

export function recover(task: Task, option: RecoveryOption, rewindTo?: number): Task {
  expectStatus(task, 'blocked');
  switch (option) {
    case 'restart-from-checkpoint':
      return { ...task, failuresInPhase: [], status: { kind: 'ready', mode: 'retry' } };
    case 'resume-session':
      return { ...task, failuresInPhase: [], status: { kind: 'ready', mode: 'resume' } };
    case 'take-over':
      return { ...task, status: { kind: 'manual' } };
    case 'rewind': {
      const checkpoint = task.checkpoints.find((candidate) => candidate.sequence === rewindTo);
      if (!checkpoint) throw new DomainError(`Task ${task.id} has no checkpoint ${String(rewindTo)}`);
      const kept = task.checkpoints.filter((candidate) => candidate.sequence <= checkpoint.sequence);
      return { ...enterPhase(task, checkpoint.phaseIndex + 1), checkpoints: kept };
    }
  }
}

export function resumeFromManual(task: Task): Task {
  expectStatus(task, 'manual');
  return { ...task, failuresInPhase: [], status: { kind: 'ready', mode: 'fresh' } };
}

function advance(task: Task): Task {
  if (isLastPhase(task.lifecycle, task.phaseIndex)) return { ...task, failuresInPhase: [], status: { kind: 'done' } };
  return enterPhase(task, task.phaseIndex + 1);
}

function enterPhase(task: Task, phaseIndex: number): Task {
  phaseAt(task.lifecycle, phaseIndex);
  return { ...task, phaseIndex, failuresInPhase: [], status: { kind: 'ready', mode: 'fresh' } };
}

function expectStatus(task: Task, kind: TaskStatus['kind']): void {
  if (task.status.kind !== kind) throw new DomainError(`Task ${task.id} is ${task.status.kind}, expected ${kind}`);
}
