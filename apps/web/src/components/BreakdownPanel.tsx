import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EpicDto, ProposedStationDto } from '@terminus/contracts';
import { api } from '../api/client';
import { useAction } from './platform/useAction';

export function BreakdownPanel({ epic, prominent = false }: { epic: EpicDto; prominent?: boolean }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [brief, setBrief] = useState<string | null>(null);
  const breakdown = epic.breakdown;

  if (breakdown.status === 'running') {
    return (
      <div className="breakdown running" role="status">
        <span className="pulse-dot" aria-hidden="true" />
        {t('breakdown.running')}
      </div>
    );
  }

  if (breakdown.status === 'ready') return <BreakdownReview key={breakdown.brief} epic={epic} description={breakdown.proposal.description} proposed={breakdown.proposal.stations} />;

  const start = (text: string): Promise<void> => run(() => api.startBreakdown(epic.id, text));
  return (
    <div className="breakdown">
      {breakdown.status === 'failed' && <p className="action-error" role="alert">{t('breakdown.failed', { error: breakdown.error })}</p>}
      {brief === null ? (
        <button type="button" className={prominent ? 'btn primary' : 'btn small'} disabled={busy} onClick={() => setBrief(breakdown.status === 'failed' ? breakdown.brief : epic.description)}>
          {t('breakdown.open')}
        </button>
      ) : (
        <>
          <textarea
            id={`breakdown-brief-${epic.id}`}
            className="free-answer brief"
            aria-label={t('breakdown.brief')}
            placeholder={t('breakdown.brief')}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void start(brief)}>{t('breakdown.start')}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setBrief(null)}>{t('create.cancel')}</button>
          </div>
        </>
      )}
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}

function BreakdownReview({ epic, description, proposed }: { epic: EpicDto; description: string; proposed: readonly ProposedStationDto[] }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAction();
  const [text, setText] = useState(description);
  const [stations, setStations] = useState(proposed.map((station, index) => ({ ...station, index, kept: true })));
  const [light, setLight] = useState(false);
  const kept = stations.filter((station) => station.kept && station.title.trim());

  const accept = (): Promise<void> =>
    run(() => {
      const position = new Map(kept.map((station, index) => [station.index, index]));
      return api.acceptBreakdown(epic.id, {
        description: text,
        stations: kept.map((station) => ({
          title: station.title.trim(),
          dependsOn: station.dependsOn.flatMap((dependency) => (position.has(dependency) ? [position.get(dependency) as number] : [])),
        })),
        track: light ? 'light' : 'standard',
      });
    });

  return (
    <div className="breakdown review" aria-label={t('breakdown.review')}>
      <span className="eyebrow">{t('breakdown.review')}</span>
      <textarea id={`breakdown-description-${epic.id}`} className="free-answer brief" aria-label={t('breakdown.description')} value={text} onChange={(event) => setText(event.target.value)} />
      <ol className="proposed-stations editable">
        {stations.map((station) => (
          <li key={station.index} className={station.kept ? '' : 'dropped'}>
            <div className="row">
              <input
                aria-label={t('breakdown.stationTitle', { number: station.index + 1 })}
                className="grow"
                value={station.title}
                disabled={!station.kept}
                onChange={(event) => setStations(stations.map((candidate) => (candidate.index === station.index ? { ...candidate, title: event.target.value } : candidate)))}
              />
              <button
                type="button"
                className="btn small subtle"
                aria-label={t(station.kept ? 'breakdown.drop' : 'breakdown.keep', { number: station.index + 1 })}
                onClick={() => setStations(stations.map((candidate) => (candidate.index === station.index ? { ...candidate, kept: !candidate.kept } : candidate)))}
              >
                {station.kept ? '✕' : '↺'}
              </button>
            </div>
            <span>{station.why}</span>
            {station.dependsOn.length > 0 && <small className="muted">{t('breakdown.after', { list: station.dependsOn.map((dependency) => dependency + 1).join(', ') })}</small>}
          </li>
        ))}
      </ol>
      <label className="check">
        <input id={`breakdown-light-${epic.id}`} type="checkbox" checked={light} onChange={(event) => setLight(event.target.checked)} />
        {t('track.lightHint')}
      </label>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || kept.length === 0} onClick={() => void accept()}>
          {t('breakdown.accept', { count: kept.length })}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.dismissBreakdown(epic.id))}>{t('breakdown.dismiss')}</button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
    </div>
  );
}
