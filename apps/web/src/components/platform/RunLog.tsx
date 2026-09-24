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
    case 'check-started':
      return { tone: 'muted', text: `▷ ${String(record['name'])} · ${String(record['command'])}` };
    case 'check-output':
      return { tone: 'muted', text: `▷ ${String(record['name'])} · ${String(record['outputTail'])}` };
    default:
      return null;
  }
}

function checkIdentity(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const record = event as Record<string, unknown>;
  const isCheckProgress = record['type'] === 'check-started' || record['type'] === 'check-output';
  const isCheckResult = 'ok' in record && 'command' in record;
  if (!isCheckProgress && !isCheckResult) return null;
  return typeof record['name'] === 'string' ? record['name'] : null;
}

function foldLines(events: readonly unknown[], t: TFunction): LogLine[] {
  const lines: LogLine[] = [];
  const indexByName = new Map<string, number>();
  for (const event of events) {
    const line = describeEvent(event, t);
    if (line === null) continue;
    const name = checkIdentity(event);
    if (name === null) {
      lines.push(line);
      continue;
    }
    const existingIndex = indexByName.get(name);
    if (existingIndex === undefined) {
      indexByName.set(name, lines.length);
      lines.push(line);
    } else {
      lines[existingIndex] = line;
    }
    const record = event as Record<string, unknown>;
    if ('ok' in record && 'command' in record) indexByName.delete(name);
  }
  return lines;
}

export function RunLog({ events, live = false }: { events: readonly unknown[]; live?: boolean }) {
  const { t } = useTranslation();
  const lines = foldLines(events, t);
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
