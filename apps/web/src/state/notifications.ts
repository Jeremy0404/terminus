import { useEffect, useRef, useState } from 'react';
import type { NetworkDto } from '@terminus/contracts';

export type Permission = 'unsupported' | 'default' | 'granted' | 'denied';

function currentPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function useInboxNotifications(network: NetworkDto | null, describe: (taskTitle: string, reason: string) => { title: string; body: string }): {
  readonly permission: Permission;
  readonly ask: () => void;
} {
  const [permission, setPermission] = useState<Permission>(currentPermission);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!network) return;
    const keys = new Map(network.inbox.map((item) => [`${item.taskId}:${JSON.stringify(item.reason)}`, item]));
    const previous = known.current;
    known.current = new Set(keys.keys());
    if (!previous || permission !== 'granted') return;
    for (const [key, item] of keys) {
      if (previous.has(key)) continue;
      const task = network.tasks.find((candidate) => candidate.id === item.taskId);
      if (!task) continue;
      const message = describe(task.title, item.reason.kind);
      new Notification(message.title, { body: message.body, tag: key });
    }
  }, [network, permission, describe]);

  const ask = (): void => {
    if (typeof Notification === 'undefined') return;
    void Notification.requestPermission().then(setPermission);
  };

  return { permission, ask };
}
