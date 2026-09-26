import type { IdeaRepository } from '../../application/ports/idea-repository.js';
import type { IdeaDraft } from '../../domain/idea.js';
import type {
  AppRepository,
  DecisionRepository,
  EpicRepository,
  RunRepository,
  TaskRepository,
} from '../../application/ports/repositories.js';
import type { AgentDefaultsStore } from '../../application/ports/agent-defaults-store.js';
import type { DeploymentRepository } from '../../application/ports/deployment-repository.js';
import type { MemoryRepository } from '../../application/ports/memory-repository.js';
import type { QuotaStore } from '../../application/ports/quota-store.js';
import type { TranscriptStore } from '../../application/ports/transcript-store.js';
import type { AgentDefaults } from '../../domain/agent-choice.js';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
import type { Lesson, MemoryProposal, Term } from '../../domain/memory.js';
import type { Quota } from '../../domain/quota.js';
import type { Deployment } from '../../domain/release.js';
import type { Run } from '../../domain/run.js';
import type { Task } from '../../domain/task.js';

class Store<T extends { readonly id: string }> {
  protected readonly items = new Map<string, T>();

  save(item: T): void {
    this.items.set(item.id, item);
  }

  get(id: string): T | null {
    return this.items.get(id) ?? null;
  }

  protected where(predicate: (item: T) => boolean): T[] {
    return [...this.items.values()].filter(predicate);
  }
}

export class InMemoryAppRepository extends Store<App> implements AppRepository {
  list(): App[] {
    return this.where(() => true);
  }
}

export class InMemoryEpicRepository extends Store<Epic> implements EpicRepository {
  listByApp(appId: string): Epic[] {
    return this.where((epic) => epic.appId === appId).sort((a, b) => a.position - b.position);
  }
}

export class InMemoryTaskRepository extends Store<Task> implements TaskRepository {
  constructor(private readonly epics: EpicRepository) {
    super();
  }

  listByEpic(epicId: string): Task[] {
    return this.where((task) => task.epicId === epicId);
  }

  listByApp(appId: string): Task[] {
    return this.where((task) => this.epics.get(task.epicId)?.appId === appId);
  }
}

export class InMemoryRunRepository extends Store<Run> implements RunRepository {
  listByTask(taskId: string): Run[] {
    return this.where((run) => run.taskId === taskId);
  }
}

export class InMemoryDecisionRepository extends Store<Decision> implements DecisionRepository {
  listByTask(taskId: string): Decision[] {
    return this.where((decision) => decision.taskId === taskId);
  }
}

export class InMemoryAgentDefaultsStore implements AgentDefaultsStore {
  constructor(private defaults: AgentDefaults = {}) {}

  all(): AgentDefaults {
    return this.defaults;
  }

  replace(defaults: AgentDefaults): void {
    this.defaults = defaults;
  }
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly lessonsById = new Map<string, Lesson>();
  private readonly termsById = new Map<string, Term>();
  private readonly proposalsById = new Map<string, MemoryProposal>();

  lessons(appId: string): Lesson[] {
    return [...this.lessonsById.values()].filter((lesson) => lesson.appId === appId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  saveLesson(lesson: Lesson): void {
    this.lessonsById.set(lesson.id, lesson);
  }

  removeLesson(id: string): boolean {
    return this.lessonsById.delete(id);
  }

  terms(appId: string): Term[] {
    return [...this.termsById.values()].filter((term) => term.appId === appId).sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
  }

  saveTerm(term: Term): void {
    this.termsById.set(term.id, term);
  }

  removeTerm(id: string): boolean {
    return this.termsById.delete(id);
  }

  pendingProposals(appId: string): MemoryProposal[] {
    return [...this.proposalsById.values()].filter((proposal) => proposal.appId === appId && proposal.status === 'pending');
  }

  proposal(id: string): MemoryProposal | null {
    return this.proposalsById.get(id) ?? null;
  }

  saveProposal(proposal: MemoryProposal): void {
    this.proposalsById.set(proposal.id, proposal);
  }
}

export class InMemoryDeploymentRepository implements DeploymentRepository {
  private readonly byId = new Map<string, Deployment>();

  save(deployment: Deployment): void {
    this.byId.set(deployment.id, deployment);
  }

  listByApp(appId: string): Deployment[] {
    return [...this.byId.values()].filter((deployment) => deployment.appId === appId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }
}

export class InMemoryQuotaStore implements QuotaStore {
  private quota: Quota | null = null;

  save(quota: Quota): void {
    this.quota = quota;
  }

  latest(): Quota | null {
    return this.quota;
  }
}

export class InMemoryTranscriptStore implements TranscriptStore {
  private readonly events = new Map<string, unknown[]>();

  append(runId: string, event: unknown): void {
    this.events.set(runId, [...this.read(runId), event]);
  }

  read(runId: string): unknown[] {
    return this.events.get(runId) ?? [];
  }
}

export class InMemoryIdeaRepository implements IdeaRepository {
  private readonly items = new Map<string, IdeaDraft>();
  list(): IdeaDraft[] { return [...this.items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id: string): IdeaDraft | null { return this.items.get(id) ?? null; }
  save(idea: IdeaDraft): void { this.items.set(idea.id, idea); }
}
