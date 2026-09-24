import type { AppDto, EpicDto, NetworkDto, TakeOverDto, TaskDetailDto, TaskSummaryDto } from '@terminus/contracts';

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
  network: (appId: string) => request<NetworkDto>(`/apps/${appId}/network`),
  task: (taskId: string) => request<TaskDetailDto>(`/tasks/${taskId}`),
  transcript: (runId: string) => request<unknown[]>(`/runs/${runId}/transcript`),
  createApp: (body: { name: string; repoPath: string; verification: { name: string; command: string }[] }) => post<AppDto>('/apps', body),
  createEpic: (appId: string, body: { code: string; name: string; status?: 'planned' | 'active' }) => post<EpicDto>(`/apps/${appId}/epics`, body),
  createTask: (epicId: string, body: { title: string; dependsOn?: string[] }) => post<TaskSummaryDto>(`/epics/${epicId}/tasks`, body),
  act: (taskId: string, action: TaskAction) => post<TaskSummaryDto | null>(`/tasks/${taskId}/${action}`),
  sendBack: (taskId: string, toPhaseId: string) => post<TaskSummaryDto>(`/tasks/${taskId}/send-back`, { toPhaseId }),
  recover: (taskId: string, option: 'restart-from-checkpoint' | 'resume-session' | 'rewind', rewindTo?: number) =>
    post<TaskSummaryDto>(`/tasks/${taskId}/recover`, rewindTo === undefined ? { option } : { option, rewindTo }),
  takeOver: (taskId: string) => post<TakeOverDto>(`/tasks/${taskId}/take-over`),
  answer: (decisionId: string, answer: { kind: 'option'; index: number } | { kind: 'other'; text: string }) =>
    post<TaskSummaryDto>(`/decisions/${decisionId}/answer`, answer),
};
