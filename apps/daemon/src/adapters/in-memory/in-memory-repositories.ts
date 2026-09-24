import type {
  AppRepository,
  DecisionRepository,
  EpicRepository,
  RunRepository,
  TaskRepository,
} from '../../application/ports/repositories.js';
import type { TranscriptStore } from '../../application/ports/transcript-store.js';
import type { App } from '../../domain/app.js';
import type { Decision } from '../../domain/decision.js';
import type { Epic } from '../../domain/epic.js';
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

export class InMemoryTranscriptStore implements TranscriptStore {
  private readonly events = new Map<string, unknown[]>();

  append(runId: string, event: unknown): void {
    this.events.set(runId, [...this.read(runId), event]);
  }

  read(runId: string): unknown[] {
    return this.events.get(runId) ?? [];
  }
}
