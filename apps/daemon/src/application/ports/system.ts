import type { Task } from '../../domain/task.js';
import type { AgentEvent } from './agent-runner.js';

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix: string): string;
  uuid(): string;
}

export type RunUpdate =
  | { readonly kind: 'task-changed'; readonly task: Task }
  | { readonly kind: 'run-event'; readonly runId: string; readonly taskId: string; readonly event: AgentEvent };

export interface RunEventBus {
  publish(update: RunUpdate): void;
}
