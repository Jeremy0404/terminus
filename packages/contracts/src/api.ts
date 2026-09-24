import { z } from 'zod';

const Autonomy = z.enum(['step-by-step', 'up-to-pr', 'up-to-merge']);

export const CreateAppBody = z.object({
  name: z.string().min(1),
  repoPath: z.string().min(1),
  verification: z.array(z.object({ name: z.string().min(1), command: z.string().min(1) })).default([]),
});

export const CreateEpicBody = z.object({
  code: z.string().regex(/^[A-Z0-9]{1,3}$/),
  name: z.string().min(1),
  status: z.enum(['planned', 'active', 'delivered']).default('active'),
});

export const CreateTaskBody = z.object({
  title: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  autonomy: Autonomy.default('up-to-pr'),
});

export const AnswerBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('other'), text: z.string().min(1) }),
]);

export const SendBackBody = z.object({ toPhaseId: z.string().min(1) });

export const RecoverBody = z.object({
  option: z.enum(['restart-from-checkpoint', 'resume-session', 'rewind']),
  rewindTo: z.number().int().positive().optional(),
});

export type AutonomyDto = z.infer<typeof Autonomy>;
export type GateDto = 'plan-approval' | 'human-review' | 'merge' | 'phase-approval';

export interface FailureDto {
  readonly kind: string;
  readonly signature: string;
  readonly message: string;
  readonly at: string;
}

export type TaskStatusDto =
  | { readonly kind: 'todo' }
  | { readonly kind: 'ready'; readonly mode: 'fresh' | 'retry' | 'resume' }
  | { readonly kind: 'running'; readonly runId: string }
  | { readonly kind: 'awaiting-decision'; readonly decisionId: string }
  | { readonly kind: 'awaiting-gate'; readonly gate: GateDto }
  | { readonly kind: 'blocked'; readonly failure: FailureDto }
  | { readonly kind: 'manual' }
  | { readonly kind: 'done' };

export interface AppDto {
  readonly id: string;
  readonly name: string;
  readonly repoPath: string;
}

export interface EpicDto {
  readonly id: string;
  readonly appId: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'planned' | 'active' | 'delivered';
  readonly position: number;
}

export interface TaskSummaryDto {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly autonomy: AutonomyDto;
  readonly phases: readonly string[];
  readonly phaseIndex: number;
  readonly status: TaskStatusDto;
  readonly dependsOn: readonly string[];
}

export interface InboxItemDto {
  readonly taskId: string;
  readonly epicId: string;
  readonly reason: { readonly kind: 'blocked' } | { readonly kind: 'decision'; readonly decisionId: string } | { readonly kind: 'gate'; readonly gate: GateDto };
  readonly unblocks: number;
}

export interface NetworkDto {
  readonly app: AppDto;
  readonly epics: readonly EpicDto[];
  readonly tasks: readonly TaskSummaryDto[];
  readonly inbox: readonly InboxItemDto[];
}

export type SuggestedActionDto =
  | { readonly kind: 'open-task' }
  | { readonly kind: 'start-phase'; readonly phaseId: string }
  | { readonly kind: 'interrupt-run' }
  | { readonly kind: 'answer-decision'; readonly decisionId: string }
  | { readonly kind: 'approve'; readonly gate: GateDto }
  | { readonly kind: 'send-back' }
  | { readonly kind: 'merge' }
  | { readonly kind: 'recover'; readonly option: 'restart-from-checkpoint' | 'resume-session' | 'rewind' | 'take-over'; readonly isDefault: boolean }
  | { readonly kind: 'split-task' }
  | { readonly kind: 'resume-from-manual' };

export interface CheckpointDto {
  readonly sequence: number;
  readonly phaseIndex: number;
  readonly ref: string;
  readonly takenAt: string;
}

export interface RunDto {
  readonly id: string;
  readonly phaseIndex: number;
  readonly status: 'running' | 'succeeded' | 'failed' | 'interrupted';
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
  readonly output: unknown;
}

export interface DecisionDto {
  readonly id: string;
  readonly phaseIndex: number;
  readonly question: string;
  readonly options: readonly { readonly label: string; readonly description: string; readonly recommended: boolean }[];
  readonly answer: { readonly kind: 'option'; readonly index: number } | { readonly kind: 'other'; readonly text: string } | null;
}

export interface TaskDetailDto {
  readonly task: TaskSummaryDto;
  readonly checkpoints: readonly CheckpointDto[];
  readonly failures: readonly FailureDto[];
  readonly actions: readonly SuggestedActionDto[];
  readonly runs: readonly RunDto[];
  readonly decisions: readonly DecisionDto[];
}

export interface TakeOverDto {
  readonly task: TaskSummaryDto;
  readonly command: string;
}

export type ServerEventDto =
  | { readonly type: 'task-changed'; readonly task: TaskSummaryDto }
  | { readonly type: 'run-event'; readonly runId: string; readonly taskId: string; readonly event: unknown }
  | { readonly type: 'check-result'; readonly runId: string; readonly taskId: string; readonly result: unknown };
