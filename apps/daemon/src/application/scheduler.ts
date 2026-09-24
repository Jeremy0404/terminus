import { pickRunnable } from '../domain/scheduling.js';
import type { Task } from '../domain/task.js';
import type { AppRepository, TaskRepository } from './ports/repositories.js';

export interface PhaseExecutor {
  run(taskId: string): Promise<Task>;
}

export class Scheduler {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly quarantined = new Set<string>();

  constructor(
    private readonly apps: AppRepository,
    private readonly tasks: TaskRepository,
    private readonly executor: PhaseExecutor,
    private readonly concurrencyLimit: number,
    private readonly onError: (taskId: string, error: unknown) => void,
  ) {}

  tick(): string[] {
    const all = this.apps.list().flatMap((app) => this.tasks.listByApp(app.id));
    const slots = Math.max(0, this.concurrencyLimit - this.inFlight.size);
    const started = pickRunnable(all, this.concurrencyLimit)
      .filter((task) => !this.inFlight.has(task.id) && !this.quarantined.has(task.id))
      .slice(0, slots)
      .map((task) => task.id);
    for (const taskId of started) {
      const flight = this.executor
        .run(taskId)
        .then(
          () => undefined,
          (error: unknown) => {
            this.quarantined.add(taskId);
            this.onError(taskId, error);
          },
        )
        .finally(() => {
          this.inFlight.delete(taskId);
          this.tick();
        });
      this.inFlight.set(taskId, flight);
    }
    return started;
  }

  release(taskId: string): void {
    this.quarantined.delete(taskId);
  }

  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight.values()]);
  }
}
