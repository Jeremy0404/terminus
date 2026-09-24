import type { Clock, IdGenerator, RunEventBus, RunUpdate } from '../../application/ports/system.js';
import type { ChecksState, CodeHost, PullRequest } from '../../application/ports/code-host.js';
import type { TaskNotes } from '../../application/ports/task-notes.js';
import type { TaskWorkspace, Workspace } from '../../application/ports/workspace.js';

export class FixedClock implements Clock {
  constructor(private readonly instant = '2026-09-24T10:00:00.000Z') {}

  now(): string {
    return this.instant;
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0;

  next(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  uuid(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class RecordingBus implements RunEventBus {
  readonly updates: RunUpdate[] = [];

  publish(update: RunUpdate): void {
    this.updates.push(update);
  }
}

export class FakeWorkspace implements Workspace {
  readonly checkpoints: string[] = [];

  prepare(_repoPath: string, appId: string, taskId: string): TaskWorkspace {
    return { taskId, path: `/worktrees/${appId}/${taskId}`, branch: `terminus/${taskId}` };
  }

  checkpoint(workspace: TaskWorkspace, sequence: number, label: string): string {
    this.checkpoints.push(`${sequence}:${label}`);
    return `refs/terminus/checkpoints/${workspace.taskId}/${sequence}`;
  }

  rewind(_workspace: TaskWorkspace, _ref: string): void {}

  diff(): string {
    return '';
  }

  remove(): void {}
}

export class FakeCodeHost implements CodeHost {
  readonly published: { branch: string; title: string; body: string }[] = [];
  readonly merged: number[] = [];
  checksState: ChecksState = 'success';
  failPublish: Error | null = null;

  publish(workspace: TaskWorkspace, _baseBranch: string, title: string, body: string): PullRequest {
    if (this.failPublish) throw this.failPublish;
    this.published.push({ branch: workspace.branch, title, body });
    return { number: 42, url: 'https://github.com/o/r/pull/42' };
  }

  checks(): ChecksState {
    return this.checksState;
  }

  merge(_repoPath: string, pullRequest: number): void {
    this.merged.push(pullRequest);
  }
}

export class FakeTaskNotes implements TaskNotes {
  directoryFor(taskId: string): string {
    return `/notes/${taskId}`;
  }
}
