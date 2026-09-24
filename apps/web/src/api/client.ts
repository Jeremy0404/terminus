import type {
  AgentChoiceDto,
  AgentPhaseDto,
  AppDto,
  ChecksResponseDto,
  CheckResultDto,
  CloseReasonDto,
  CutOverResultDto,
  EpicDto,
  NetworkDto,
  ProposalsDto,
  QuotaDto,
  RepoScanDto,
  TakeOverDto,
  TaskDetailDto,
  TaskSummaryDto,
  TrackDto,
  VerificationCommandDto,
} from '@terminus/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : response.statusText;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export type TaskAction = 'open' | 'approve' | 'merge' | 'resume-from-manual' | 'interrupt';

export const api = {
  apps: () => request<AppDto[]>('/apps'),
  quota: () => request<QuotaDto | null>('/quota'),
  agentSettings: () => request<AgentPhaseDto[]>('/settings/agents'),
  saveAgentSettings: (defaults: Record<string, AgentChoiceDto>) =>
    request<AgentPhaseDto[]>('/settings/agents', { method: 'PUT', body: JSON.stringify({ defaults }) }),
  chooseAgent: (taskId: string, choice: AgentChoiceDto) => post<TaskSummaryDto>(`/tasks/${taskId}/agent`, choice),
  network: (appId: string) => request<NetworkDto>(`/apps/${appId}/network`),
  task: (taskId: string) => request<TaskDetailDto>(`/tasks/${taskId}`),
  checks: (taskId: string) => request<ChecksResponseDto>(`/tasks/${taskId}/checks`),
  transcript: (runId: string) => request<unknown[]>(`/runs/${runId}/transcript`),
  createApp: (body: { name: string; repoPath: string; verification: { name: string; command: string }[] }) => post<AppDto>('/apps', body),
  createEpic: (appId: string, body: { code: string; name: string; status?: 'planned' | 'active'; description?: string }) => post<EpicDto>(`/apps/${appId}/epics`, body),
  startBreakdown: (epicId: string, brief: string) => post<EpicDto>(`/epics/${epicId}/breakdown`, { brief }),
  acceptBreakdown: (epicId: string, body: { description: string; stations: { title: string; dependsOn: number[] }[]; track: TrackDto }) =>
    post<TaskSummaryDto[]>(`/epics/${epicId}/breakdown/accept`, body),
  dismissBreakdown: (epicId: string) => post<EpicDto>(`/epics/${epicId}/breakdown/dismiss`),
  createTask: (epicId: string, body: { title: string; dependsOn?: string[]; track?: TrackDto }) => post<TaskSummaryDto>(`/epics/${epicId}/tasks`, body),
  skip: (taskId: string) => post<TaskSummaryDto>(`/tasks/${taskId}/skip`),
  setTrack: (taskId: string, track: TrackDto) => post<TaskSummaryDto>(`/tasks/${taskId}/track`, { track }),
  act: (taskId: string, action: TaskAction) => post<TaskSummaryDto | null>(`/tasks/${taskId}/${action}`),
  sendBack: (taskId: string, toPhaseId: string) => post<TaskSummaryDto>(`/tasks/${taskId}/send-back`, { toPhaseId }),
  recover: (taskId: string, option: 'restart-from-checkpoint' | 'resume-session' | 'rewind', rewindTo?: number) =>
    post<TaskSummaryDto>(`/tasks/${taskId}/recover`, rewindTo === undefined ? { option } : { option, rewindTo }),
  takeOver: (taskId: string) => post<TakeOverDto>(`/tasks/${taskId}/take-over`),
  close: (taskId: string, reason: CloseReasonDto, evidence: string) =>
    post<{ task: TaskSummaryDto; warnings: string[] }>(`/tasks/${taskId}/close`, { reason, evidence }),
  answer: (decisionId: string, answer: { kind: 'option'; index: number } | { kind: 'other'; text: string }) =>
    post<TaskSummaryDto>(`/decisions/${decisionId}/answer`, answer),
  scanRepo: (repoPath: string) => post<RepoScanDto>('/adoption/scan', { repoPath }),
  healthCheck: (repoPath: string, commands: readonly VerificationCommandDto[]) => post<CheckResultDto[]>('/adoption/health', { repoPath, commands }),
  proposals: (repoPath: string) => post<ProposalsDto>('/adoption/proposals', { repoPath }),
  cutOver: (plan: CutOverPlan) => post<CutOverResultDto>('/adoption/cut-over', plan),
};

export interface CutOverPlan {
  readonly name: string;
  readonly repoPath: string;
  readonly verification: readonly VerificationCommandDto[];
  readonly lines: readonly { readonly code: string; readonly name: string; readonly tasks: readonly { readonly title: string; readonly issueNumber?: number }[] }[];
  readonly closeIssues: boolean;
}
