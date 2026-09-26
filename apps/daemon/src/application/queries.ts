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
import type { MemoryRepository } from './ports/memory-repository.js';
import type { QuotaStore } from './ports/quota-store.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { TranscriptStore } from './ports/transcript-store.js';

const TASK_DOCUMENTS = ['spec.md', 'plan.md', 'checklist.md', 'preview.json'];
const MAX_DOCUMENT_CHARS = 60_000;

export interface Network {
  readonly app: App;
  readonly epics: readonly Epic[];
  readonly tasks: readonly Task[];
  readonly inbox: readonly InboxItem[];
  readonly memoryProposals: number;
  readonly obsoleteFlags: readonly ObsoleteFlag[];
}

export interface ObsoleteFlag {
  readonly proposalId: string;
  readonly taskId: string;
  readonly sourceTitle: string;
  readonly reason: string;
}

export interface TaskDetail {
  readonly documents: readonly { name: string; content: string; truncated: boolean }[];
  readonly task: Task;
  readonly actions: readonly SuggestedAction[];
  readonly runs: readonly Run[];
  readonly decisions: readonly Decision[];
}

export interface QueriesDeps {
  readonly notes: TaskNotes;
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly runs: RunRepository;
  readonly decisions: DecisionRepository;
  readonly transcripts: TranscriptStore;
  readonly quota: QuotaStore;
  readonly memory: MemoryRepository;
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
    const proposals = this.deps.memory.pendingProposals(appId);
    const titles = new Map(tasks.map((task) => [task.id, task.title]));
    const obsoleteFlags = proposals.flatMap((proposal) =>
      proposal.proposed.kind === 'obsolete'
        ? [{ proposalId: proposal.id, taskId: proposal.proposed.targetTaskId, sourceTitle: titles.get(proposal.sourceTaskId) ?? proposal.sourceTaskId, reason: proposal.why }]
        : [],
    );
    return { app, epics: this.deps.epics.listByApp(appId), tasks, inbox: buildInbox(tasks), memoryProposals: proposals.length, obsoleteFlags };
  }

  task(taskId: string): TaskDetail {
    const task = this.deps.tasks.get(taskId);
    if (!task) throw new NotFound(`Unknown task ${taskId}`);
    const epic = this.deps.epics.get(task.epicId);
    const siblings = epic ? this.deps.tasks.listByApp(epic.appId) : [task];
    return {
      task,
      documents: TASK_DOCUMENTS.flatMap((name) => {
        const content = this.deps.notes.read(taskId, name);
        return content?.trim() ? [{ name, content: content.slice(0, MAX_DOCUMENT_CHARS), truncated: content.length > MAX_DOCUMENT_CHARS }] : [];
      }),
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
