import { z } from 'zod';

const Autonomy = z.enum(['step-by-step', 'up-to-pr', 'up-to-merge']);
const Track = z.enum(['standard', 'light']);

export type TrackDto = z.infer<typeof Track>;

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const Effort = z.enum(EFFORT_LEVELS);

export type EffortDto = z.infer<typeof Effort>;

export const AgentChoiceBody = z.object({
  model: z.string().regex(/^[\w.\-[\]]{1,100}$/).nullable(),
  effort: Effort.nullable(),
});

export type AgentChoiceDto = z.infer<typeof AgentChoiceBody>;

export const AgentDefaultsBody = z.object({ fallback: AgentChoiceBody, defaults: z.record(z.string(), AgentChoiceBody) });

export interface AgentPhaseDto {
  readonly key: string;
  readonly lifecycleId: string;
  readonly phaseId: string;
  readonly choice: AgentChoiceDto;
  readonly inherited: AgentChoiceDto;
}

export interface AgentSettingsDto {
  readonly fallback: AgentChoiceDto;
  readonly phases: readonly AgentPhaseDto[];
}

export const TrackBody = z.object({ track: Track });

export const CreateAppBody = z.object({
  name: z.string().min(1),
  repoPath: z.string().min(1),
  verification: z.array(z.object({ name: z.string().min(1), command: z.string().min(1) })).default([]),
});

export const FoundAppBody = z.object({
  name: z.string().trim().min(1).max(80),
  idea: z.string().trim().min(1).max(4000),
  repoPath: z.string().trim().max(500).default(''),
  visibility: z.enum(['private', 'public']).default('private'),
});

export const CreateEpicBody = z.object({
  code: z.string().regex(/^[A-Z0-9]{1,3}$/),
  name: z.string().min(1),
  status: z.enum(['planned', 'active', 'delivered']).default('active'),
  description: z.string().max(4000).default(''),
});

export const BreakdownBody = z.object({ brief: z.string().max(4000).default('') });

export const AcceptBreakdownBody = z.object({
  description: z.string().max(4000),
  stations: z.array(z.object({ title: z.string().min(1), why: z.string().max(1000).default(''), dependsOn: z.array(z.number().int().min(0)).default([]) })).min(1),
  track: z.enum(['standard', 'light']).default('standard'),
});

export const CreateTaskBody = z.object({
  title: z.string().min(1),
  description: z.string().max(4000).default(''),
  dependsOn: z.array(z.string()).default([]),
  autonomy: Autonomy.default('up-to-pr'),
  track: Track.default('standard'),
});

export const StationDraftBody = z.object({ text: z.string().trim().min(1).max(4000) });

export const AnswerBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), index: z.number().int().min(0) }),
  z.object({ kind: z.literal('other'), text: z.string().min(1) }),
]);

export const SendBackBody = z.object({ toPhaseId: z.string().min(1), comment: z.string().max(2000).default('') });

export const RecoverBody = z.object({
  option: z.enum(['restart-from-checkpoint', 'resume-session', 'rewind']),
  rewindTo: z.number().int().positive().optional(),
});

export type AutonomyDto = z.infer<typeof Autonomy>;

export const CloseBody = z.object({
  reason: z.enum(['already-done', 'obsolete', 'duplicate', 'abandoned']),
  evidence: z.string().max(2000).default(''),
});

export type CloseReasonDto = z.infer<typeof CloseBody>['reason'];
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
  | { readonly kind: 'done' }
  | { readonly kind: 'closed'; readonly reason: CloseReasonDto; readonly evidence: string };

export interface AppDto {
  readonly id: string;
  readonly name: string;
  readonly repoPath: string;
}

export interface ProposedStationDto {
  readonly title: string;
  readonly why: string;
  readonly dependsOn: readonly number[];
}

export type BreakdownDto =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly brief: string; readonly runId: string }
  | { readonly status: 'ready'; readonly brief: string; readonly proposal: { readonly description: string; readonly stations: readonly ProposedStationDto[] } }
  | { readonly status: 'failed'; readonly brief: string; readonly error: string };

export interface StationDraftDto {
  readonly title: string;
  readonly understanding: string;
  readonly summary: string;
}

export interface EpicDto {
  readonly id: string;
  readonly appId: string;
  readonly code: string;
  readonly name: string;
  readonly status: 'planned' | 'active' | 'delivered';
  readonly position: number;
  readonly description: string;
  readonly breakdown: BreakdownDto;
}

export interface TaskSummaryDto {
  readonly id: string;
  readonly epicId: string;
  readonly title: string;
  readonly description: string;
  readonly autonomy: AutonomyDto;
  readonly track: TrackDto;
  readonly lifecycleId: string;
  readonly agent: AgentChoiceDto;
  readonly phases: readonly string[];
  readonly phasesInTrack: readonly string[];
  readonly skippablePhases: readonly string[];
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
  readonly memoryProposals: number;
  readonly obsoleteFlags: readonly ObsoleteFlagDto[];
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
  | { readonly kind: 'resume-from-manual' }
  | { readonly kind: 'skip-phase'; readonly phaseId: string };

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
  readonly agent: AgentChoiceDto | null;
}

export type ProposalDto =
  | { readonly kind: 'close'; readonly reason: 'already-done' | 'obsolete' | 'duplicate'; readonly evidence: string }
  | { readonly kind: 'split'; readonly stations: readonly { readonly title: string; readonly why: string }[] }
  | { readonly kind: 'lighten' };

export interface DecisionDto {
  readonly id: string;
  readonly kind: 'question' | 'deviation' | 'proposal';
  readonly proposal: ProposalDto | null;
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

export type ChecksStateDto = 'none' | 'pending' | 'success' | 'failure';

export interface ChecksResponseDto {
  readonly state: ChecksStateDto;
}

export interface QuotaWindowDto {
  readonly kind: string;
  readonly utilization: number;
  readonly resetsAt: string;
}

export interface QuotaDto {
  readonly limited: boolean;
  readonly windows: readonly QuotaWindowDto[];
  readonly observedAt: string;
}

export const LessonBody = z.object({ text: z.string().trim().min(1).max(600) });

export const TermBody = z.object({ term: z.string().trim().min(1).max(80), definition: z.string().trim().min(1).max(600) });

export interface LessonDto {
  readonly id: string;
  readonly text: string;
  readonly sourceTaskId: string | null;
  readonly createdAt: string;
}

export interface TermDto {
  readonly id: string;
  readonly term: string;
  readonly definition: string;
  readonly updatedAt: string;
}

export type ProposedMemoryDto =
  | { readonly kind: 'lesson'; readonly text: string }
  | { readonly kind: 'term'; readonly term: string; readonly definition: string }
  | { readonly kind: 'obsolete'; readonly targetTaskId: string; readonly targetTitle: string };

export interface ObsoleteFlagDto {
  readonly proposalId: string;
  readonly taskId: string;
  readonly sourceTitle: string;
  readonly reason: string;
}

export interface MemoryProposalDto {
  readonly id: string;
  readonly sourceTaskId: string;
  readonly sourceTitle: string;
  readonly proposed: ProposedMemoryDto;
  readonly why: string;
}

export interface MemoryDto {
  readonly lessons: readonly LessonDto[];
  readonly terms: readonly TermDto[];
  readonly proposals: readonly MemoryProposalDto[];
  readonly pack: string;
}

export interface PlaybookSkillDto {
  readonly name: string;
  readonly playbook: string;
  readonly researched: string | null;
  readonly stale: boolean;
}

export interface RitualStartedDto {
  readonly appId: string;
  readonly task: TaskSummaryDto;
}

export type ServerEventDto =
  | { readonly type: 'task-changed'; readonly task: TaskSummaryDto }
  | { readonly type: 'epic-changed'; readonly epic: EpicDto }
  | { readonly type: 'run-event'; readonly runId: string; readonly taskId: string; readonly event: unknown }
  | { readonly type: 'check-started'; readonly runId: string; readonly taskId: string; readonly name: string; readonly command: string }
  | { readonly type: 'check-output'; readonly runId: string; readonly taskId: string; readonly name: string; readonly command: string; readonly outputTail: string }
  | { readonly type: 'check-result'; readonly runId: string; readonly taskId: string; readonly result: unknown }
  | { readonly type: 'quota-changed'; readonly quota: QuotaDto }
  | { readonly type: 'memory-changed'; readonly appId: string };

const VerificationCommandSchema = z.object({ name: z.string().min(1), command: z.string().min(1) });

export const RepoPathBody = z.object({ repoPath: z.string().min(1) });

export const HealthCheckBody = z.object({ repoPath: z.string().min(1), commands: z.array(VerificationCommandSchema) });

export const CutOverBody = z.object({
  name: z.string().min(1),
  repoPath: z.string().min(1),
  verification: z.array(VerificationCommandSchema),
  lines: z
    .array(
      z.object({
        code: z.string().regex(/^[A-Z0-9]{1,3}$/),
        name: z.string().min(1),
        tasks: z.array(z.object({ title: z.string().min(1), issueNumber: z.number().int().positive().optional() })),
      }),
    )
    .min(1),
  closeIssues: z.boolean(),
});

export interface VerificationCommandDto {
  readonly name: string;
  readonly command: string;
}

export interface RepoScanDto {
  readonly repoPath: string;
  readonly name: string;
  readonly isGitRepo: boolean;
  readonly hasOrigin: boolean;
  readonly defaultBranch: string | null;
  readonly packageManager: string | null;
  readonly ciWorkflows: readonly string[];
  readonly agentDocs: readonly string[];
  readonly suggestedVerification: readonly VerificationCommandDto[];
  readonly todos: readonly { readonly file: string; readonly line: number; readonly text: string }[];
}

export interface CheckResultDto {
  readonly name: string;
  readonly command: string;
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly outputTail: string;
  readonly durationMs: number;
}

export interface ProposalsDto {
  readonly issues: readonly { readonly number: number; readonly title: string; readonly url: string; readonly labels: readonly string[] }[];
  readonly todos: RepoScanDto['todos'];
  readonly warnings: readonly string[];
}

export interface CutOverResultDto {
  readonly app: AppDto;
  readonly closedIssues: readonly number[];
  readonly closeErrors: readonly string[];
}
