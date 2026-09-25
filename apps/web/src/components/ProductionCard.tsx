import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReleaseStateDto } from '@terminus/contracts';
import { api } from '../api/client';

export function ProductionCard({ appId }: { appId: string }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<ReleaseStateDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .release(appId)
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  if (!state) return null;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const run = state.lastRun;
  return (
    <section className="card production" aria-labelledby="production-title">
      <span className="eyebrow" id="production-title">{t('production.eyebrow')}</span>
      <p className="production-live">
        {state.latest ? (
          <a href={state.latest.url} target="_blank" rel="noreferrer">
            {t('production.latest', { version: state.latest.version, date: date.format(new Date(state.latest.publishedAt)) })}
          </a>
        ) : (
          t('production.none')
        )}
        {run && (
          <a className={`tag run-${run.state}`} href={run.url} target="_blank" rel="noreferrer">
            {t(`production.run.${run.state}`, { version: run.version ?? '?' })}
          </a>
        )}
      </p>
      {state.pending && (
        <p>
          <a href={state.pending.url} target="_blank" rel="noreferrer">{t('production.pending', { version: state.pending.version ?? state.pending.title })}</a>
        </p>
      )}
      {!state.deploysOnRelease && <p className="muted small">{t('production.noDeploy')}</p>}
    </section>
  );
}
