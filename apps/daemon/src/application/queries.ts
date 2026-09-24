import type { App } from '../domain/app.js';
import type { Decision } from '../domain/decision.js';
import type { Epic } from '../domain/epic.js';
import { DomainError } from '../domain/errors.js';
import { buildInbox, type InboxItem } from '../domain/inbox.js';
import type { Quota } from '../domain/quota.js';
import type { Run } from '../domain/run.js';
import { suggestedActions, type SuggestedAction } from '../domain/suggestions.js';
import type { Task } from '../domain/task.js';
import type { AppRepository, DecisionRepository, EpicRepository, RunRepository, TaskRepository } from './ports/repositories.js';
import type { QuotaStore } from './ports/quota-store.js';
import type { TranscriptStore } from './ports/transcript-store.js';

export interface Network {
  readonly app: App;
  readonly epics: readonly Epic[];
  readonly tasks: readonly Task[];
  readonly inbox: readonly InboxItem[];
}

export interface TaskDetail {
  readonly task: Task;
  readonly actions: readonly SuggestedAction[];
  readonly runs: readonly Run[];
  readonly decisions: readonly Decision[];
}

export interface QueriesDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly transcripts: TranscriptStore;
  readonly quota: QuotaStore;
}

export class Queries {
  constructor(private readonly deps: QueriesDeps) {}

  apps(): App[] {
    return this.deps.apps.list();
  }

  network(appId: string): Network {
    const app = this.deps.apps.get(appId);
    if (!app) throw new NotFound(`Unknown app ${appId}`);
    const tasks = this.deps.tasks.listByApp(appId);
    return { app, epics: this.deps.epics.listByApp(appId), tasks, inbox: buildInbox(tasks) };
  }

  task(taskId: string): TaskDetail {
    const task = this.deps.tasks.get(taskId);
    if (!task) throw new NotFound(`Unknown task ${taskId}`);
    const epic = this.deps.epics.get(task.epicId);
    const siblings = epic ? this.deps.tasks.listByApp(epic.appId) : [task];
    return {
      task,
      actions: suggestedActions(task, siblings),
      runs: this.deps.runs.listByTask(taskId),
      decisions: this.deps.decisions.listByTask(taskId),
    };
  }

  transcript(runId: string): unknown[] {
    if (!this.deps.runs.get(runId)) throw new NotFound(`Unknown run ${runId}`);
    return this.deps.transcripts.read(runId);
  }

  quota(): Quota | null {
    return this.deps.quota.latest();
  }
}

export class NotFound extends DomainError {}
