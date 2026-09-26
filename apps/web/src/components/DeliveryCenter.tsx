import type { NetworkDto } from '@terminus/contracts';
import { useTranslation } from 'react-i18next';
import { finished } from '../network/exploration';
import { ProductionCard } from './ProductionCard';
import { StatusPill } from './StatusPill';

export function DeliveryCenter({ network, onOpen, onMemory }: { network: NetworkDto; onOpen: (line: string, task: string) => void; onMemory: () => void }) {
  const { t } = useTranslation();
  const remaining = network.tasks.filter((task) => !finished(task));
  return <main className="delivery-center">
    <header><span className="eyebrow">{network.app.name}</span><h2>{t('delivery.title')}</h2><p className="muted">{t('delivery.hint')}</p></header>
    <ProductionCard key={network.app.id} appId={network.app.id} detailed appUrl={network.app.product?.appUrl ?? ''} />
    <section className="card"><h3>{t('delivery.remaining')}</h3><p className="muted">{t('delivery.scope')}</p>
      <ul className="journey-list station-list">{remaining.map((task) => <li key={task.id}><button onClick={() => onOpen(task.epicId, task.id)}><b>{task.title}</b><StatusPill status={task.status} /></button></li>)}</ul>
      {remaining.length === 0 && <p>{t('delivery.clear')}</p>}
    </section>
    <button className="btn" onClick={onMemory}>{t('delivery.configure')}</button>
  </main>;
}
