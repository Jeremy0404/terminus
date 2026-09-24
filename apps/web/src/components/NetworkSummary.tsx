import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { NewLineForm } from './NewLineForm';

export function NetworkSummary({ network }: { network: NetworkDto }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const merged = network.tasks.filter((task) => task.status.kind === 'done').length;
  const running = network.tasks.filter((task) => task.status.kind === 'running').length;
  return (
    <section className="card">
      <span className="eyebrow">{t('summary.eyebrow', { app: network.app.name })}</span>
      <div className="stats">
        <div><b>{network.epics.length}</b><span>{t('summary.lines')}</span></div>
        <div><b>{merged}/{network.tasks.length}</b><span>{t('summary.merged')}</span></div>
        <div><b>{running}</b><span>{t('summary.running', { count: running })}</span></div>
      </div>
      {adding ? (
        <NewLineForm network={network} onDone={() => setAdding(false)} />
      ) : (
        <div className="row card-actions">
          <button type="button" className="btn small" onClick={() => setAdding(true)}>{t('create.line.open')}</button>
        </div>
      )}
    </section>
  );
}
