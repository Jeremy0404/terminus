import type { App, VerificationCommand } from '../domain/app.js';
import { IDLE_BREAKDOWN, type Epic, type EpicStatus } from '../domain/epic.js';
import { DomainError } from '../domain/errors.js';
import type { Autonomy, Track } from '../domain/lifecycle.js';
import { assertAcyclic } from '../domain/scheduling.js';
import { createTask, type Task } from '../domain/task.js';
import type { PlaybookRegistry } from './ports/playbook-registry.js';
import type { AppRepository, EpicRepository, TaskRepository } from './ports/repositories.js';
import type { Clock, IdGenerator, RunEventBus } from './ports/system.js';

export interface CatalogDeps {
  readonly apps: AppRepository;
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly playbooks: PlaybookRegistry;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly bus: RunEventBus;
}

export class Catalog {
  constructor(private readonly deps: CatalogDeps) {}

  createApp(input: { name: string; repoPath: string; verification: readonly VerificationCommand[] }): App {
    const app: App = { id: this.deps.ids.next('app'), ...input, createdAt: this.deps.clock.now() };
    this.deps.apps.save(app);
    return app;
  }

  createEpic(appId: string, input: { code: string; name: string; status: EpicStatus; description?: string }): Epic {
    if (!this.deps.apps.get(appId)) throw new DomainError(`Unknown app ${appId}`);
    const siblings = this.deps.epics.listByApp(appId);
    if (siblings.some((epic) => epic.code === input.code)) throw new DomainError(`Line ${input.code} already exists`);
    const epic: Epic = { id: this.deps.ids.next('epic'), appId, ...input, description: input.description ?? '', breakdown: IDLE_BREAKDOWN, position: siblings.length + 1 };
    this.deps.epics.save(epic);
    return epic;
  }

  createTask(epicId: string, input: { title: string; description?: string; dependsOn: readonly string[]; autonomy: Autonomy; track?: Track }): Task {
    const epic = this.deps.epics.get(epicId);
    if (!epic) throw new DomainError(`Unknown epic ${epicId}`);
    const existing = this.deps.tasks.listByApp(epic.appId);
    const unknown = input.dependsOn.filter((id) => !existing.some((task) => task.id === id));
    if (unknown.length > 0) throw new DomainError(`Unknown dependencies: ${unknown.join(', ')}`);
    const task = createTask({ id: this.deps.ids.next('task'), epicId, lifecycle: this.deps.playbooks.lifecycle('task'), ...input });
    assertAcyclic([...existing, task]);
    this.deps.tasks.save(task);
    this.deps.bus.publish({ kind: 'task-changed', task });
    return task;
  }
}
