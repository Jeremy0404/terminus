import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReleaseStateDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

const FOLLOW_MS = 10_000;
const ACTIVE = new Set(['requested', 'running']);

export function ProductionCard({ appId }: { appId: string }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<ReleaseStateDto | null>(null);
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let cancelled = false;
    api
      .release(appId, version > 0)
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, version]);

  const following = state?.deployments.some((deployment) => ACTIVE.has(deployment.state)) ?? false;
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => setVersion((current) => current + 1), FOLLOW_MS);
    return () => clearInterval(timer);
  }, [following]);

  if (!state) return null;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const lastRun = state.lastRun;
  const pending = state.pending;
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
        {lastRun && (
          <a className={`tag run-${lastRun.state}`} href={lastRun.url} target="_blank" rel="noreferrer">
            {t(`production.run.${lastRun.state}`, { version: lastRun.version ?? '?' })}
          </a>
        )}
      </p>
      {pending && !confirming && (
        <div className="row">
          <a href={pending.url} target="_blank" rel="noreferrer">{t('production.pending', { version: pending.version ?? pending.title })}</a>
          {pending.version && !following && (
            <button type="button" className="btn primary small" onClick={() => setConfirming(true)}>
              {t('production.deploy', { version: pending.version })}
            </button>
          )}
        </div>
      )}
      {pending?.version && confirming && (
        <div className="deploy-confirm" role="dialog" aria-label={t('production.confirmTitle', { version: pending.version })}>
          <b>{t('production.confirmTitle', { version: pending.version })}</b>
          <p className="muted small">{state.deploysOnRelease ? t('production.confirmDeploy') : t('production.confirmPublishOnly')}</p>
          {pending.notes && <div className="brief-preview release-notes">{pending.notes}</div>}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.deploy(appId, pending.version ?? '');
                  setConfirming(false);
                  setVersion((current) => current + 1);
                })
              }
            >
              {t('production.confirm')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>{t('create.cancel')}</button>
          </div>
        </div>
      )}
      {error && <p className="action-error" role="alert">{error}</p>}
      {!state.deploysOnRelease && <p className="muted small">{t('production.noDeploy')}</p>}
      {state.deployments.length > 0 && (
        <ul className="deployments">
          {state.deployments.map((deployment) => (
            <li key={deployment.id}>
              <span className={`tag run-${deployment.state === 'requested' ? 'queued' : deployment.state}`}>{t(`production.deployment.${deployment.state}`, { version: deployment.version })}</span>
              {deployment.runUrl && <a className="small" href={deployment.runUrl} target="_blank" rel="noreferrer">{t('production.runLink')}</a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
