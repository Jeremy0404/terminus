import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { LineBadge } from './LineBadge';
import { StatusPill } from './StatusPill';

interface Props {
  readonly network: NetworkDto;
  readonly lineId: string | null;
  readonly onOpen: (epicId: string, taskId: string) => void;
  readonly collapsible?: boolean;
  readonly open?: boolean;
  readonly onToggle?: () => void;
}

export function Inbox({ network, lineId, onOpen, collapsible = false, open = true, onToggle }: Props) {
  const { t } = useTranslation();
  const items = network.inbox.filter((item) => !lineId || item.epicId === lineId);
  const scope = lineId ? t('inbox.scopeLine', { code: network.epics.find((epic) => epic.id === lineId)?.code ?? '' }) : t('inbox.scopeNetwork');
  const header = (
    <>
      <span>
        <span className="inbox-title">{t('inbox.title')}</span>
        <small>{scope}</small>
      </span>
      <span className="inbox-count">{items.length}</span>
    </>
  );
  return (
    <section className="inbox" aria-label={t('inbox.title')}>
      {collapsible ? (
        <button type="button" className="inbox-head" aria-expanded={open} onClick={onToggle}>
          {header}
        </button>
      ) : (
        <div className="inbox-head">{header}</div>
      )}
      {open && (
        <ol>
          {items.length === 0 && <li className="inbox-empty">{t('inbox.empty')}</li>}
          {items.map((item) => {
            const task = network.tasks.find((candidate) => candidate.id === item.taskId);
            const epic = network.epics.find((candidate) => candidate.id === item.epicId);
            if (!task || !epic) return null;
            return (
              <li key={item.taskId}>
                <button type="button" onClick={() => onOpen(epic.id, task.id)}>
                  <LineBadge epic={epic} />
                  <span>
                    <span className="inbox-task">{task.title}</span>
                    <span className="inbox-meta">
                      <StatusPill status={task.status} />
                      {item.unblocks > 0 && t('inbox.unblocks', { count: item.unblocks })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
