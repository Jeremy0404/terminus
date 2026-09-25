import type { NetworkDto } from '@terminus/contracts';
import { availableTasks } from './progress';

export type NextStep =
  | { readonly kind: 'open-station'; readonly epicId: string; readonly taskId: string; readonly title: string }
  | { readonly kind: 'break-down'; readonly epicId: string; readonly name: string }
  | { readonly kind: 'create-line' }
  | { readonly kind: 'review-memory'; readonly count: number };

export function nextStep(network: NetworkDto, lineId: string | null = null): NextStep | null {
  const epics = [...network.epics].filter((epic) => lineId === null || epic.id === lineId).sort((a, b) => a.position - b.position);
  if (lineId === null && network.memoryProposals > 0) return { kind: 'review-memory', count: network.memoryProposals };
  if (lineId === null && epics.length === 0) return { kind: 'create-line' };
  const available = availableTasks(network.tasks);
  for (const epic of epics) {
    const openable = available.find((task) => task.epicId === epic.id);
    if (openable) return { kind: 'open-station', epicId: epic.id, taskId: openable.id, title: openable.title };
  }
  const empty = epics.find((epic) => epic.breakdown.status === 'idle' && !network.tasks.some((task) => task.epicId === epic.id));
  return empty ? { kind: 'break-down', epicId: empty.id, name: empty.name } : null;
}
