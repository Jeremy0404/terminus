import { describe, expect, it } from 'vitest';
import { InMemoryAppRepository, InMemoryEpicRepository, InMemoryTaskRepository } from '../adapters/in-memory/in-memory-repositories.js';
import { createTask, type Task, type TaskStatus } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import { Scheduler, type PhaseExecutor } from './scheduler.js';

function setup(statuses: Record<string, TaskStatus>) {
  const apps = new InMemoryAppRepository();
  const epics = new InMemoryEpicRepository();
  const tasks = new InMemoryTaskRepository(epics);
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', createdAt: 'x' });
  epics.save({ id: 'epic', appId: 'app', code: 'I', name: 'I', status: 'active', position: 1 });
  for (const [id, status] of Object.entries(statuses)) {
    tasks.save({ ...createTask({ id, epicId: 'epic', title: id, lifecycle: TASK_LIFECYCLE }), status });
  }
  return { apps, tasks };
}

class ControlledExecutor implements PhaseExecutor {
  readonly started: string[] = [];
  private readonly finishers = new Map<string, () => void>();

  constructor(private readonly tasks: InMemoryTaskRepository) {}

  run(taskId: string): Promise<Task> {
    this.started.push(taskId);
    const task = this.tasks.get(taskId) as Task;
    this.tasks.save({ ...task, status: { kind: 'running', runId: `run-${taskId}` } });
    return new Promise((resolve) => {
      this.finishers.set(taskId, () => {
        const done: Task = { ...task, status: { kind: 'done' } };
        this.tasks.save(done);
        resolve(done);
      });
    });
  }

  finish(taskId: string): void {
    this.finishers.get(taskId)?.();
  }
}

const ready: TaskStatus = { kind: 'ready', mode: 'fresh' };

describe('Scheduler', () => {
  it('starts ready tasks up to the concurrency limit and refills slots as runs end', async () => {
    const { apps, tasks } = setup({ a: ready, b: ready, c: ready, d: { kind: 'todo' } });
    const executor = new ControlledExecutor(tasks);
    const scheduler = new Scheduler(apps, tasks, executor, 2, () => {});

    expect(scheduler.tick()).toEqual(['a', 'b']);
    expect(scheduler.tick()).toEqual([]);

    executor.finish('a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(executor.started).toEqual(['a', 'b', 'c']);

    executor.finish('b');
    executor.finish('c');
    await scheduler.idle();
  });

  it('reports a failing run without stopping the scheduler', async () => {
    const { apps, tasks } = setup({ a: ready });
    const errors: string[] = [];
    const scheduler = new Scheduler(apps, tasks, { run: () => Promise.reject(new Error('boom')) }, 2, (taskId) => errors.push(taskId));

    scheduler.tick();
    await scheduler.idle();

    expect(errors).toEqual(['a']);
    expect(scheduler.tick()).toEqual([]);

    scheduler.release('a');
    expect(scheduler.tick()).toEqual(['a']);
    await scheduler.idle();
  });
});
