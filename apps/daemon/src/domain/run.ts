export type RunStatus = 'running' | 'succeeded' | 'failed' | 'interrupted';

export interface RunUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface Run {
  readonly id: string;
  readonly taskId: string;
  readonly phaseIndex: number;
  readonly sessionId: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly usage: RunUsage | null;
}
