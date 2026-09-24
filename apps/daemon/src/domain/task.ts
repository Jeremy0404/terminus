import type { Checkpoint } from './checkpoint.js';
import { DomainError } from './errors.js';
import { decideAfterFailure, isLooping, type Failure, type FailurePolicy } from './failure.js';
import {
  appliesTo,
  nextPhaseIndex,
  phaseAt,
  phaseIndexOf,
  requiresHuman,
  type Autonomy,
  type GateKind,
  type LifecycleDefinition,
  type Track,
} from './lifecycle.js';

export type RecoveryOption = 'restart-from-checkpoint' | 'resume-session' | 'rewind' | 'take-over';

export const DEFAULT_RECOVERY: RecoveryOption = 'restart-from-checkpoint';

export type RunMode = 'fresh' | 'retry' | 'resume';

export type CloseReason = 'already-done' | 'obsolete' | 'duplicate' | 'abandoned';

export const SATISFYING_CLOSE_REASONS: readonly CloseReason[] = ['already-done', 'obsolete', 'duplicate'];

export type TaskStatus =
  | { readonly kind: 'todo' }
  | { readonly kind: 'ready'; readonly mode: RunMode }
  | { readonly kind: 'running'; readonly runId: string }
  | { readonly kind: 'awaiting-decision'; readonly decisionId: string }
  | { readonly kind: 'awaiting-gate'; readonly gate: GateKind | 'phase-approval' }
  | { readonly kind: 'blocked'; readonly failure: Failure }
  | { readonly kind: 'manual' }
  | { readonly kind: 'done' }
  | { readonly kind: 'closed'; readonly reason: CloseReason; readonly evidence: string };

export interface Task {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly lifecycle: LifecycleDefinition;
  readonly autonomy: Autonomy;
  readonly track: Track;
  readonly dependsOn: readonly string[];
  readonly phaseIndex: number;
  readonly status: TaskStatus;
  readonly failuresInPhase: readonly Failure[];
  readonly checkFailures: readonly Failure[];
  readonly checkpoints: readonly Checkpoint[];
}

export interface NewTask {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly lifecycle: LifecycleDefinition;
  readonly autonomy?: Autonomy;
  readonly track?: Track;
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
    track: input.track ?? 'standard',
    dependsOn: input.dependsOn ?? [],
    phaseIndex: 0,
    status: { kind: 'todo' },
    failuresInPhase: [],
    checkFailures: [],
    checkpoints: [],
  };
}

export function currentPhaseId(task: Task): string {
  return phaseAt(task.lifecycle, task.phaseIndex).id;
}

export function openTask(task: Task, dependencies: readonly Task[]): Task {
  expectStatus(task, 'todo');
  const pending = task.dependsOn.filter((id) => { const dependency = dependencies.find((dep) => dep.id === id); return !dependency || !isSettled(dependency); });
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

export function holdForProposal(task: Task, decisionId: string): Task {
  expectStatus(task, 'ready');
  return { ...task, status: { kind: 'awaiting-decision', decisionId } };
}

export function releaseProposal(task: Task): Task {
  expectStatus(task, 'awaiting-decision');
  return { ...task, status: { kind: 'ready', mode: 'fresh' } };
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
  if (!appliesTo(phaseAt(task.lifecycle, target), task.track)) throw new DomainError(`Phase ${toPhaseId} is not part of the ${task.track} track`);
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
      const resumeAt = nextPhaseIndex(task.lifecycle, task.track, checkpoint.phaseIndex);
      if (resumeAt === null) throw new DomainError(`Task ${task.id} has nothing left after checkpoint ${checkpoint.sequence}`);
      return { ...enterPhase(task, resumeAt), checkpoints: kept };
    }
  }
}

export function passChecks(task: Task, checkpoint: Checkpoint): Task {
  return completePhase({ ...task, checkFailures: [] }, checkpoint);
}

export function rejectByChecks(task: Task, failure: Failure, fixPhaseId: string, policy: FailurePolicy): Task {
  expectStatus(task, 'running');
  const checkFailures = [...task.checkFailures, failure];
  const looping = isLooping(
    checkFailures.map((candidate) => candidate.signature),
    Math.min(policy.loopThreshold, policy.maxCheckCycles),
  );
  if (looping || checkFailures.length > policy.maxCheckCycles) {
    return { ...task, checkFailures, status: { kind: 'blocked', failure } };
  }
  const fixPhase = phaseIndexOf(task.lifecycle, fixPhaseId);
  if (fixPhase >= task.phaseIndex) throw new DomainError(`Cannot send task ${task.id} forward to ${fixPhaseId}`);
  return { ...task, checkFailures, phaseIndex: fixPhase, failuresInPhase: [failure], status: { kind: 'ready', mode: 'retry' } };
}

export function closeTask(task: Task, reason: CloseReason, evidence: string): Task {
  if (task.status.kind === 'running') throw new DomainError(`Task ${task.id} has a run in progress; interrupt it before closing`);
  if (task.status.kind === 'done' || task.status.kind === 'closed') throw new DomainError(`Task ${task.id} is already ${task.status.kind}`);
  return { ...task, status: { kind: 'closed', reason, evidence } };
}

export function isSettled(task: Task): boolean {
  return task.status.kind === 'done' || (task.status.kind === 'closed' && SATISFYING_CLOSE_REASONS.includes(task.status.reason));
}

const OPEN_FOR_CHANGES: readonly TaskStatus['kind'][] = ['todo', 'ready', 'awaiting-decision', 'awaiting-gate', 'blocked'];

export function setTrack(task: Task, track: Track): Task {
  if (!OPEN_FOR_CHANGES.includes(task.status.kind)) throw new DomainError(`Task ${task.id} is ${task.status.kind}; its track can no longer change`);
  const switched = { ...task, track };
  if (appliesTo(phaseAt(task.lifecycle, task.phaseIndex), track)) return switched;
  return task.status.kind === 'todo' ? { ...switched, phaseIndex: nextPhaseIndex(task.lifecycle, track, task.phaseIndex) ?? task.phaseIndex } : advance(switched);
}

export function canSkipPhase(task: Task): boolean {
  return phaseAt(task.lifecycle, task.phaseIndex).skippable === true && OPEN_FOR_CHANGES.includes(task.status.kind) && task.status.kind !== 'todo';
}

export function skipPhase(task: Task): Task {
  const phase = phaseAt(task.lifecycle, task.phaseIndex);
  if (phase.skippable !== true) throw new DomainError(`Phase ${phase.id} cannot be skipped`);
  if (!canSkipPhase(task)) throw new DomainError(`Task ${task.id} is ${task.status.kind}; phase ${phase.id} cannot be skipped now`);
  return advance(task);
}

export function resumeFromManual(task: Task): Task {
  expectStatus(task, 'manual');
  return { ...task, failuresInPhase: [], status: { kind: 'ready', mode: 'fresh' } };
}

function advance(task: Task): Task {
  const next = nextPhaseIndex(task.lifecycle, task.track, task.phaseIndex);
  if (next === null) return { ...task, failuresInPhase: [], status: { kind: 'done' } };
  return enterPhase(task, next);
}

function enterPhase(task: Task, phaseIndex: number): Task {
  phaseAt(task.lifecycle, phaseIndex);
  return { ...task, phaseIndex, failuresInPhase: [], status: { kind: 'ready', mode: 'fresh' } };
}

function expectStatus(task: Task, kind: TaskStatus['kind']): void {
  if (task.status.kind !== kind) throw new DomainError(`Task ${task.id} is ${task.status.kind}, expected ${kind}`);
}
