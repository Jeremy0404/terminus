import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';
import { availableTasks } from './progress';

export type DepartureKind = 'decision' | 'blocked' | 'available';
export interface Departure {
  readonly task: TaskSummaryDto;
  readonly kind: DepartureKind;
  readonly unblocks: number;
}

export function departuresOf(network: NetworkDto): Departure[] {
  const available = new Set(availableTasks(network.tasks).map((task) => task.id));
  const rank: Record<DepartureKind, number> = { decision: 0, blocked: 1, available: 2 };
  return network.tasks.flatMap((task): Departure[] => {
    const kind = task.status.kind;
    const category = kind === 'awaiting-decision' || kind === 'awaiting-gate' ? 'decision'
      : kind === 'blocked' || kind === 'manual' ? 'blocked'
      : available.has(task.id) ? 'available' : null;
    if (!category || !network.epics.some((epic) => epic.id === task.epicId)) return [];
    const unblocks = network.inbox.find((item) => item.taskId === task.id)?.unblocks
      ?? network.tasks.filter((candidate) => candidate.status.kind === 'todo' && candidate.dependsOn.includes(task.id)).length;
    return [{ task, kind: category, unblocks }];
  }).sort((a, b) => rank[a.kind] - rank[b.kind] || b.unblocks - a.unblocks || a.task.title.localeCompare(b.task.title));
}
