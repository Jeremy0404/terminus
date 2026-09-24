import type { Task } from '../../domain/task.js';
import type { AgentEvent } from './agent-runner.js';
import type { CheckResult } from './check-runner.js';

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
  uuid(): string;
}

export type RunUpdate =
  | { readonly kind: 'task-changed'; readonly task: Task }
  | { readonly kind: 'run-event'; readonly runId: string; readonly taskId: string; readonly event: AgentEvent }
  | { readonly kind: 'check-started'; readonly runId: string; readonly taskId: string; readonly name: string; readonly command: string }
  | { readonly kind: 'check-output'; readonly runId: string; readonly taskId: string; readonly name: string; readonly command: string; readonly outputTail: string }
  | { readonly kind: 'check-result'; readonly runId: string; readonly taskId: string; readonly result: CheckResult };

export interface RunEventBus {
  publish(update: RunUpdate): void;
}
