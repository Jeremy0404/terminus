import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

interface LogLine {
  readonly tone: 'plain' | 'muted' | 'good' | 'bad' | 'accent';
  readonly text: string;
}

export function describeEvent(event: unknown, t: TFunction): LogLine | null {
  if (typeof event !== 'object' || event === null) return null;
  const record = event as Record<string, unknown>;
  if ('ok' in record && 'command' in record) {
    return { tone: record['ok'] ? 'good' : 'bad', text: `${record['ok'] ? '✓' : '✗'} ${String(record['name'])} · ${String(record['command'])}` };
  }
  switch (record['type']) {
    case 'text':
      return { tone: 'plain', text: String(record['text']) };
    case 'tool-call':
      return { tone: 'muted', text: `→ ${String(record['tool'])} ${String(record['summary'])}` };
    case 'tool-failure':
      return { tone: 'bad', text: `✗ ${String(record['tool'])} ${String(record['summary'])}` };
    case 'usage':
      return { tone: 'muted', text: t('run.usage', { input: record['inputTokens'], output: record['outputTokens'] }) };
    case 'finished':
      return { tone: record['outcome'] === 'success' ? 'good' : 'accent', text: `■ ${String(record['outcome'])} · ${String(record['summary'])}` };
    default:
      return null;
  }
}

export function RunLog({ events, live = false }: { events: readonly unknown[]; live?: boolean }) {
  const { t } = useTranslation();
  const lines = events.map((event) => describeEvent(event, t)).filter((line): line is LogLine => line !== null);
  return (
    <pre className="run-log" aria-live={live ? 'polite' : 'off'}>
      {lines.length === 0 && <span className="log-muted">{t('run.empty')}</span>}
      {lines.map((line, index) => (
        <span key={index} className={`log-${line.tone}`}>
          {line.text}
          {'\n'}
        </span>
      ))}
      {live && <span className="cursor" aria-hidden="true" />}
    </pre>
  );
}
