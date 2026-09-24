import type { GateKind } from './lifecycle.js';
import { dependenciesMet } from './scheduling.js';
import { canSkipPhase, currentPhaseId, DEFAULT_RECOVERY, type RecoveryOption, type Task } from './task.js';

export type SuggestedAction =
  | { readonly kind: 'open-task' }
  | { readonly kind: 'start-phase'; readonly phaseId: string }
  | { readonly kind: 'interrupt-run' }
  | { readonly kind: 'answer-decision'; readonly decisionId: string }
  | { readonly kind: 'approve'; readonly gate: GateKind | 'phase-approval' }
  | { readonly kind: 'send-back' }
  | { readonly kind: 'merge' }
  | { readonly kind: 'recover'; readonly option: RecoveryOption; readonly isDefault: boolean }
  | { readonly kind: 'split-task' }
  | { readonly kind: 'resume-from-manual' }
  | { readonly kind: 'skip-phase'; readonly phaseId: string };

const RECOVERY_ORDER: readonly RecoveryOption[] = ['restart-from-checkpoint', 'resume-session', 'rewind', 'take-over'];

export function suggestedActions(task: Task, tasks: readonly Task[]): SuggestedAction[] {
  const actions = statusActions(task, tasks);
  return canSkipPhase(task) ? [...actions, { kind: 'skip-phase', phaseId: currentPhaseId(task) }] : actions;
}

function statusActions(task: Task, tasks: readonly Task[]): SuggestedAction[] {
  const status = task.status;
  switch (status.kind) {
    case 'todo':
      return dependenciesMet(task, tasks) ? [{ kind: 'open-task' }] : [];
    case 'ready':
      return [{ kind: 'start-phase', phaseId: currentPhaseId(task) }];
    case 'running':
      return [{ kind: 'interrupt-run' }];
    case 'awaiting-decision':
      return [{ kind: 'answer-decision', decisionId: status.decisionId }];
    case 'awaiting-gate':
      return status.gate === 'merge' ? [{ kind: 'merge' }] : [{ kind: 'approve', gate: status.gate }, { kind: 'send-back' }];
    case 'blocked':
      return [
        ...RECOVERY_ORDER.filter((option) => option !== 'rewind' || task.checkpoints.length > 0).map(
          (option): SuggestedAction => ({ kind: 'recover', option, isDefault: option === DEFAULT_RECOVERY }),
        ),
        { kind: 'split-task' },
      ];
    case 'manual':
      return [{ kind: 'resume-from-manual' }];
    case 'done':
    case 'closed':
      return [];
  }
}
