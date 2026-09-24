import { useSyncExternalStore } from 'react';

const TOAST_MS = 2600;

export interface Toast {
  readonly id: number;
  readonly text: string;
}

interface Snapshot {
  readonly pending: number;
  readonly toasts: readonly Toast[];
}

let snapshot: Snapshot = { pending: 0, toasts: [] };
let nextId = 1;
const listeners = new Set<() => void>();

function update(change: (current: Snapshot) => Snapshot): void {
  snapshot = change(snapshot);
  listeners.forEach((listener) => listener());
}

export const activity = {
  begin(): () => void {
    update((current) => ({ ...current, pending: current.pending + 1 }));
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      update((current) => ({ ...current, pending: current.pending - 1 }));
    };
  },
  done(text: string): void {
    const toast = { id: nextId++, text };
    update((current) => ({ ...current, toasts: [...current.toasts, toast] }));
    setTimeout(() => update((current) => ({ ...current, toasts: current.toasts.filter((candidate) => candidate.id !== toast.id) })), TOAST_MS);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: (): Snapshot => snapshot,
};

export function useActivity(): Snapshot {
  return useSyncExternalStore(activity.subscribe, activity.snapshot);
}
