import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { departuresOf, type DepartureKind } from '../network/departures';
import { LineBadge } from './LineBadge';
import { StatusPill } from './StatusPill';

interface Props {
  readonly network: NetworkDto;
  readonly lineId: string | null;
  readonly onOpen: (epicId: string, taskId: string) => void;
  readonly onMemory?: () => void;
}

const GROUPS: readonly DepartureKind[] = ['decision', 'blocked', 'available'];

export function Inbox({ network, lineId, onOpen, onMemory }: Props) {
  const { t } = useTranslation();
  const departures = departuresOf(network);
  const local = departures.filter((item) => !lineId || item.task.epicId === lineId);
  const elsewhere = departures.filter((item) => lineId && item.task.epicId !== lineId && item.kind !== 'available');
  const attention = departures.filter((item) => item.kind !== 'available').length + (onMemory ? network.memoryProposals : 0);
  const scope = lineId ? t('inbox.scopeLine', { code: network.epics.find((epic) => epic.id === lineId)?.code ?? '' }) : t('inbox.scopeNetwork');
  const renderItems = (items: typeof departures) => (
    <ol>
      {items.map(({ task, kind, unblocks }) => {
        const epic = network.epics.find((candidate) => candidate.id === task.epicId);
        if (!epic) return null;
        return (
          <li key={task.id}>
            <button type="button" onClick={() => onOpen(epic.id, task.id)}>
              <LineBadge epic={epic} />
              <span>
                <span className="inbox-task">{task.title}</span>
                <span className="inbox-meta"><StatusPill status={task.status} /></span>
                <span className="departure-why">{t(`inbox.why.${kind}`)}</span>
                {unblocks > 0 && <span className="departure-impact">{t('inbox.unblocks', { count: unblocks })}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
  return (
    <section className={`inbox ${attention > 0 ? 'needs-attention' : 'is-calm'}`} aria-label={t('inbox.title')}>
      <div className="inbox-head">
        <span><span className="inbox-title">{t('inbox.title')}</span><small>{scope}</small></span>
        <span className="inbox-count" aria-label={t('inbox.attention', { count: attention })}>{attention}</span>
      </div>
      {local.length === 0 && <p className="inbox-empty">{t('inbox.empty')}</p>}
      {onMemory && network.memoryProposals > 0 && <div className="inbox-memory"><button type="button" className="btn small" onClick={onMemory}>{t('nextStep.reviewMemory', { count: network.memoryProposals })}</button></div>}
      {GROUPS.map((kind) => {
        const items = local.filter((item) => item.kind === kind);
        return items.length > 0 && <div className="departure-group" key={kind}><h3>{t(`inbox.group.${kind}`)} <span>{items.length}</span></h3>{renderItems(items)}</div>;
      })}
      {elsewhere.length > 0 && <div className="departure-group elsewhere"><h3>{t('inbox.elsewhere', { count: elsewhere.length })}</h3>{renderItems(elsewhere)}</div>}
    </section>
  );
}
