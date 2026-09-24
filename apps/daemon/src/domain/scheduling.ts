import { DomainError } from './errors.js';
import type { Task } from './task.js';

export function dependenciesMet(task: Task, tasks: readonly Task[]): boolean {
  return task.dependsOn.every((id) => tasks.find((candidate) => candidate.id === id)?.status.kind === 'done');
}

export function unblockCount(taskId: string, tasks: readonly Task[]): number {
  const blocked = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const candidate of tasks) {
      if (candidate.status.kind !== 'done' && candidate.dependsOn.includes(current) && !blocked.has(candidate.id)) {
        blocked.add(candidate.id);
        queue.push(candidate.id);
      }
    }
  }
  return blocked.size;
}

export function assertAcyclic(tasks: readonly Task[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new DomainError(`Dependency cycle: ${[...path, id].join(' -> ')}`);
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id, []);
}

export function pickRunnable(tasks: readonly Task[], concurrencyLimit: number): Task[] {
  const running = tasks.filter((task) => task.status.kind === 'running').length;
  const slots = Math.max(0, concurrencyLimit - running);
  return tasks
    .filter((task) => task.status.kind === 'ready')
    .map((task) => ({ task, unblocks: unblockCount(task.id, tasks) }))
    .sort((a, b) => b.unblocks - a.unblocks || a.task.id.localeCompare(b.task.id))
    .slice(0, slots)
    .map(({ task }) => task);
}
