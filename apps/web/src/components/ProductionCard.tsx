import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReleaseStateDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

const FOLLOW_MS = 10_000;
const ACTIVE = new Set(['requested', 'running']);

export function ProductionCard({ appId, detailed = false, appUrl = '' }: { appId: string; detailed?: boolean; appUrl?: string }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<ReleaseStateDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let cancelled = false;
    api
      .release(appId, version > 0)
      .then((loaded) => {
        if (!cancelled) { setState(loaded); setLoaded(true); setLoadError(false); }
      })
      .catch(() => {
        if (!cancelled) { setLoadError(true); setLoaded(true); }
      });
    return () => {
      cancelled = true;
    };
  }, [appId, version]);

  const following = (state?.deployments.some((deployment) => ACTIVE.has(deployment.state)) ?? false) || state?.lastRun?.state === 'queued' || state?.lastRun?.state === 'running';
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => setVersion((current) => current + 1), FOLLOW_MS);
    return () => clearInterval(timer);
  }, [following]);

  if (!state) return detailed ? <section className="card"><p role={loadError ? 'alert' : 'status'}>{t(loadError ? 'delivery.loadError' : loaded ? 'delivery.unconfigured' : 'app.loading')}</p><button className="btn" onClick={() => setVersion((n) => n + 1)}>{t('platform.retry')}</button></section> : null;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const lastRun = state.lastRun;
  const pending = state.pending;
  const production = state.deploysOnRelease && lastRun?.deploymentVerified && lastRun.state === 'succeeded' && lastRun.version ? lastRun.version : null;
  const canDeploy = state.checks === 'success' || state.checks === 'none';
  const safeAppUrl = /^https?:\/\//i.test(appUrl) ? appUrl : '';
  return (
    <section className="card production" aria-labelledby="production-title">
      <span className="eyebrow" id="production-title">{t('production.eyebrow')}</span>
      {detailed && <><h3>{t('delivery.production')}</h3><p>{production ? t('delivery.live', { version: production }) : t('delivery.unconfirmed')}</p>{production && safeAppUrl && <a className="btn primary" href={safeAppUrl} target="_blank" rel="noreferrer">{t('delivery.open')}</a>}</>}
      {loadError && <p role="alert">{t('delivery.stale')}</p>}
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
      {detailed && <><h3>{t('delivery.ready')}</h3><p className="muted">{t(pending ? 'delivery.candidate' : 'delivery.noCandidate')}</p>{pending?.notes && <div className="brief-preview release-notes">{pending.notes}</div>}</>}
      {pending && <p className="tag">{t(`delivery.checks.${state.checks ?? 'unavailable'}`)}</p>}
      {detailed && <button className="btn small" onClick={() => setVersion((n) => n + 1)}>{t('delivery.refresh')}</button>}
      {pending && (!confirming || confirming !== pending.version) && (
        <div className="row">
          <a href={pending.url} target="_blank" rel="noreferrer">{t('production.pending', { version: pending.version ?? pending.title })}</a>
          {pending.version && !following && (
            <button type="button" className="btn primary small" disabled={state.serverChecklistPending === true || (state.checks !== undefined && !canDeploy)} onClick={() => setConfirming(pending.version)}>
              {t(state.deploysOnRelease ? 'production.deploy' : 'production.publish', { version: pending.version })}
            </button>
          )}
          {state.serverChecklistPending && <span className="muted small">{t('production.serverChecklist')}</span>}
        </div>
      )}
      {pending?.version && confirming && confirming === pending.version && (
        <div className="deploy-confirm" role="dialog" aria-label={t(state.deploysOnRelease ? 'production.confirmTitle' : 'production.confirmPublishTitle', { version: pending.version })}>
          <b>{t(state.deploysOnRelease ? 'production.confirmTitle' : 'production.confirmPublishTitle', { version: pending.version })}</b>
          <p className="muted small">{state.deploysOnRelease ? t('production.confirmDeploy') : t('production.confirmPublishOnly')}</p>
          {pending.notes && <div className="brief-preview release-notes">{pending.notes}</div>}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.deploy(appId, confirming);
                  setConfirming(null);
                  setVersion((current) => current + 1);
                })
              }
            >
              {t(state.deploysOnRelease ? 'production.confirm' : 'production.confirmPublish')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>{t('create.cancel')}</button>
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
