import { DomainError } from './errors.js';

export type Autonomy = 'step-by-step' | 'up-to-pr' | 'up-to-merge';

export type PhaseExecutorKind = 'agent' | 'checks' | 'sync' | 'code-host';

export type Track = 'standard' | 'light';

export type GateKind = 'plan-approval' | 'human-review' | 'merge';

export interface PhaseDefinition {
  readonly id: string;
  readonly gate?: GateKind;
  readonly skill?: string;
  readonly model?: string;
  readonly output?: 'decisions' | 'review';
  readonly executor?: PhaseExecutorKind;
  readonly retryFrom?: string;
  readonly tracks?: readonly Track[];
  readonly skippable?: boolean;
}

export interface LifecycleDefinition {
  readonly id: string;
  readonly version: string;
  readonly phases: readonly PhaseDefinition[];
}

export function phaseAt(lifecycle: LifecycleDefinition, index: number): PhaseDefinition {
  const phase = lifecycle.phases[index];
  if (!phase) throw new DomainError(`Lifecycle ${lifecycle.id} has no phase at index ${index}`);
  return phase;
}

export function phaseIndexOf(lifecycle: LifecycleDefinition, phaseId: string): number {
  const index = lifecycle.phases.findIndex((phase) => phase.id === phaseId);
  if (index === -1) throw new DomainError(`Lifecycle ${lifecycle.id} has no phase ${phaseId}`);
  return index;
}

export function appliesTo(phase: PhaseDefinition, track: Track): boolean {
  return !phase.tracks || phase.tracks.includes(track);
}

export function nextPhaseIndex(lifecycle: LifecycleDefinition, track: Track, after: number): number | null {
  for (let index = after + 1; index < lifecycle.phases.length; index += 1) {
    const phase = lifecycle.phases[index];
    if (phase && appliesTo(phase, track)) return index;
  }
  return null;
}

export function isLastPhase(lifecycle: LifecycleDefinition, index: number): boolean {
  return index === lifecycle.phases.length - 1;
}

export function requiresHuman(phase: PhaseDefinition, autonomy: Autonomy): boolean {
  if (autonomy === 'step-by-step') return true;
  if (!phase.gate) return false;
  if (autonomy === 'up-to-merge') return phase.gate === 'plan-approval';
  return true;
}
