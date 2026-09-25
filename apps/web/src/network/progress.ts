import type { TaskStatusDto, TaskSummaryDto } from '@terminus/contracts';

export const OUTCOMES = ['integrated', 'existing', 'active', 'todo', 'abandoned', 'obsolete', 'duplicate'] as const;
export type Outcome = typeof OUTCOMES[number];

export function outcomeOf(status: TaskStatusDto): Outcome {
  if (status.kind === 'done') return 'integrated';
  if (status.kind === 'closed') return status.reason === 'already-done' ? 'existing' : status.reason;
  return status.kind === 'todo' ? 'todo' : 'active';
}

export function progressOf(tasks: readonly TaskSummaryDto[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { integrated: 0, existing: 0, active: 0, todo: 0, abandoned: 0, obsolete: 0, duplicate: 0 };
  for (const task of tasks) counts[outcomeOf(task.status)] += 1;
  return counts;
}

export function satisfiesDependency(task: TaskSummaryDto | undefined): boolean {
  return !!task && (task.status.kind === 'done' || (task.status.kind === 'closed' && task.status.reason !== 'abandoned'));
}

export function availableTasks(tasks: readonly TaskSummaryDto[]): TaskSummaryDto[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => task.status.kind === 'todo' && task.dependsOn.every((id) => satisfiesDependency(byId.get(id))));
}
