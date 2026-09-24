import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuotaDto } from '@terminus/contracts';

const TICK_MS = 60_000;
const WARN_AT = 0.8;
const STOP_AT = 0.95;

function toneOf(utilization: number): 'go' | 'signal' | 'stop' {
  if (utilization >= STOP_AT) return 'stop';
  return utilization >= WARN_AT ? 'signal' : 'go';
}

export function QuotaGauge({ quota }: { quota: QuotaDto | null }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!quota || quota.windows.length === 0) return null;
  const time = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const windows = quota.windows.map((entry) => {
    const reset = Date.parse(entry.resetsAt) <= now;
    return { ...entry, reset, percent: reset ? 0 : Math.round(Math.min(1, Math.max(0, entry.utilization)) * 100) };
  });
  const limited = quota.limited && windows.some((entry) => !entry.reset);

  return (
    <div className="quota" role="group" aria-label={t('quota.label')}>
      {limited && <span className="tag bad">{t('quota.limited')}</span>}
      {windows.map((entry) => {
        const name = t(`quota.window.${entry.kind}`, { defaultValue: entry.kind });
        const title = entry.reset
          ? t('quota.titleReset', { window: name })
          : t('quota.title', { window: name, percent: entry.percent, reset: time.format(new Date(entry.resetsAt)), observed: time.format(new Date(quota.observedAt)) });
        return (
          <div
            key={entry.kind}
            className={`quota-window tone-${toneOf(entry.percent / 100)}`}
            role="meter"
            aria-label={name}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={entry.percent}
            title={title}
          >
            <span className="quota-name">{name}</span>
            <span className="quota-track">
              <span className="quota-fill" style={{ width: `${entry.percent}%` }} />
            </span>
            <span className="quota-value">{entry.reset ? t('quota.reset') : `${entry.percent} %`}</span>
          </div>
        );
      })}
    </div>
  );
}
