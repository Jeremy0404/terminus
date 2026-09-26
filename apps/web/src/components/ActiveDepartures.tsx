import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { StatusPill } from './StatusPill';

const ACTIVE_STATUSES: readonly string[] = ['running', 'ready', 'manual', 'blocked'];

interface Props {
  readonly network: NetworkDto;
  readonly onOpen: (line: string, task: string) => void;
}

export function ActiveDepartures({ network, onOpen }: Props) {
  const { t } = useTranslation();
  const active = network.tasks.filter((task) => ACTIVE_STATUSES.includes(task.status.kind));
  return (
    <main className="pocket-content card">
      <h2>{t('pocket.active')}</h2>
      <ul className="journey-list station-list">
        {active.map((task) => <li key={task.id}><button onClick={() => onOpen(task.epicId, task.id)}><b>{task.title}</b><StatusPill status={task.status} /></button></li>)}
      </ul>
      {active.length === 0 && <p className="muted">{t('pocket.empty')}</p>}
    </main>
  );
}
