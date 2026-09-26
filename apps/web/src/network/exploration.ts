import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';

export const finished = (task: TaskSummaryDto): boolean => task.status.kind === 'done' || task.status.kind === 'closed';
export function routeTo(tasks: readonly TaskSummaryDto[], epicId: string): ReadonlySet<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ids = new Set<string>();
  const visit = (id: string): void => { if (ids.has(id)) return; ids.add(id); byId.get(id)?.dependsOn.forEach(visit); };
  tasks.filter((task) => task.epicId === epicId).forEach((task) => visit(task.id));
  return ids;
}
export function explore(network: NetworkDto, mode: 'all' | 'remaining' | 'route', epicId: string, query: string): NetworkDto {
  const route = mode === 'route' ? routeTo(network.tasks, epicId) : null;
  const term = query.trim().toLocaleLowerCase();
  const tasks = network.tasks.filter((task) => (mode !== 'remaining' || !finished(task)) && (!route || route.has(task.id)) && (!term || `${task.title} ${task.description}`.toLocaleLowerCase().includes(term)));
  const epics = network.epics.filter((epic) => tasks.some((task) => task.epicId === epic.id) || (mode === 'all' && !term));
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
