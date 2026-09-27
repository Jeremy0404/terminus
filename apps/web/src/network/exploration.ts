import type { EpicDto, NetworkDto, TaskSummaryDto } from '@terminus/contracts';

export const finished = (task: TaskSummaryDto): boolean => task.status.kind === 'done' || task.status.kind === 'closed';
export function finishedLine(epic: EpicDto, tasks: readonly TaskSummaryDto[]): boolean {
  const stations = tasks.filter((task) => task.epicId === epic.id);
  return epic.status === 'delivered' || (stations.length > 0 && stations.every(finished));
}
export function explore(network: NetworkDto, query: string): NetworkDto {
  const term = query.trim().toLocaleLowerCase();
  const tasks = network.tasks.filter((task) => !term || `${task.title} ${task.description}`.toLocaleLowerCase().includes(term));
  const epics = network.epics.filter((epic) => !term || tasks.some((task) => task.epicId === epic.id));
  return { ...network, tasks, epics };
}
export function stationSymbol(task: TaskSummaryDto): string {
  const kind = task.status.kind;
  if (kind === 'done' || (kind === 'closed' && task.status.reason === 'already-done')) return '✓';
  if (kind === 'closed') return '×';
  if (kind === 'blocked' || kind === 'manual') return '!';
  if (kind === 'awaiting-decision' || kind === 'awaiting-gate') return '?';
  if (kind === 'running' || kind === 'ready') return '▶';
  return '○';
}
