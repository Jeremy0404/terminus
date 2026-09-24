import type { GateKind } from './lifecycle.js';
import { unblockCount } from './scheduling.js';
import type { Task } from './task.js';

export type InboxReason =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'decision'; readonly decisionId: string }
  | { readonly kind: 'gate'; readonly gate: GateKind | 'phase-approval' };

export interface InboxItem {
  readonly taskId: string;
  readonly epicId: string;
  readonly reason: InboxReason;
  readonly unblocks: number;
}

export function buildInbox(tasks: readonly Task[]): InboxItem[] {
  return tasks
    .flatMap((task): InboxItem[] => {
      const reason = inboxReason(task);
      return reason ? [{ taskId: task.id, epicId: task.epicId, reason, unblocks: unblockCount(task.id, tasks) }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.reason.kind === 'blocked') - Number(a.reason.kind === 'blocked') ||
        b.unblocks - a.unblocks ||
        a.taskId.localeCompare(b.taskId),
    );
}

function inboxReason(task: Task): InboxReason | null {
  switch (task.status.kind) {
    case 'blocked':
      return { kind: 'blocked' };
    case 'awaiting-decision':
      return { kind: 'decision', decisionId: task.status.decisionId };
    case 'awaiting-gate':
      return { kind: 'gate', gate: task.status.gate };
    default:
      return null;
  }
}
