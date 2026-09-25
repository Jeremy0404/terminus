import { memo } from 'react';
import { progressOf } from '../../network/progress';
import { useTranslation } from 'react-i18next';
import type { TaskSummaryDto } from '@terminus/contracts';
import { ROUNDEL_RADIUS, type NetworkLayout, type Point } from '../../network/layout';
import { lineColor } from '../../network/line-colors';
import { isActive, statusKey, toneOf } from '../../network/tone';
import type { Level } from '../../state/location';

const LABEL_CHARS = 18;
const LABEL_BELOW = 32;
const LABEL_ABOVE = 26;
const ORIGIN_R = 11;
const INTERCHANGE_R = 17;
const ORIGIN_LABEL_GAP = 12;
const LINE_LABEL_GAP = 8;
const LINE_NAME_RISE = 30;
const LINE_META_RISE = 15;

const pathData = (points: readonly Point[]): string => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

const shorten = (text: string): string => (text.length > LABEL_CHARS ? `${text.slice(0, LABEL_CHARS - 1)}…` : text);

interface Props {
  readonly layout: NetworkLayout;
  readonly appName: string;
  readonly tasks: readonly TaskSummaryDto[];
  readonly level: Level;
  readonly openLine: string | null;
  readonly selectedTask: string | null;
  readonly onLine: (epicId: string) => void;
  readonly onStation: (epicId: string, taskId: string) => void;
  readonly onBackground: () => void;
}

export const MapDrawing = memo(function MapDrawing({ layout, appName, tasks, level, openLine, selectedTask, onLine, onStation, onBackground }: Props) {
  const { t } = useTranslation();
  const dimmed = (epicId: string): boolean => level !== 'network' && openLine !== epicId;

  return (
    <>
      {layout.transfers.map((transfer) => {
        const fromEpic = tasks.find((task) => task.id === transfer.fromTaskId)?.epicId ?? '';
        const toEpic = tasks.find((task) => task.id === transfer.toTaskId)?.epicId ?? '';
        const dim = level !== 'network' && openLine !== fromEpic && openLine !== toEpic;
        return (
          <g key={`${transfer.fromTaskId}-${transfer.toTaskId}`} className={`transfer ${dim ? 'dim' : ''}`}>
            <line x1={transfer.from.x} y1={transfer.from.y} x2={transfer.to.x} y2={transfer.to.y} className="interchange-link" />
          </g>
        );
      })}
      {layout.lines.map((line) => {
        const color = lineColor(line.epic.position);
        const planned = line.epic.status === 'planned';
        const progress = progressOf(line.stations.map((station) => station.task));
        const remaining = progress.todo + progress.active;
        return (
          <g key={line.epic.id} className={`line ${dimmed(line.epic.id) ? 'dim' : ''}`} style={{ color }}>
            <g className="line-hit" role="button" tabIndex={0} aria-label={t('map.line', { name: line.epic.name })} onClick={() => onLine(line.epic.id)}
              onKeyDown={(event) => event.key === 'Enter' && onLine(line.epic.id)}>
              <path d={pathData(line.path)} className="line-hit-area" />
              <path d={pathData(line.path)} className={`line-track ${planned ? 'planned' : ''}`} />
              <line x1={line.endX} y1={line.y - 13} x2={line.endX} y2={line.y + 13} className="line-terminus" />
              <LineRoundel x={line.startX} y={line.y} code={line.epic.code} />
              <text x={line.startX + ROUNDEL_RADIUS + LINE_LABEL_GAP} y={line.y - LINE_NAME_RISE} className="line-name">
                {line.epic.name}
              </text>
              <text x={line.startX + ROUNDEL_RADIUS + LINE_LABEL_GAP} y={line.y - LINE_META_RISE} className="line-meta">
                {t('map.remaining', { count: remaining })}
              </text>
            </g>
            {line.stations.map(({ task, x, y, labelSide, interchange }) => {
              const tone = toneOf(task.status);
              const active = isActive(task.status);
              const selected = selectedTask === task.id;
              return (
                <g key={task.id} className={`station tone-${tone} ${interchange ? 'interchange' : ''}`} role="button" tabIndex={0}
                  aria-label={`${task.title}, ${t(statusKey(task.status))}`}
                  onClick={() => onStation(line.epic.id, task.id)}
                  onKeyDown={(event) => event.key === 'Enter' && onStation(line.epic.id, task.id)}>
                  {interchange && <circle cx={x} cy={y} r={INTERCHANGE_R} className="interchange-ring" />}
                  {(tone === 'signal' || tone === 'stop') && <circle cx={x} cy={y} r={13} className="station-pulse" />}
                  <circle cx={x} cy={y} r={active ? 12 : 9} className="station-dot" />
                  {task.status.kind === 'running' && (
                    <>
                      <rect x={x - 9} y={y - 6} width={18} height={12} rx={6} className="train" />
                      <circle cx={x} cy={y} r={2.5} className="train-light" />
                    </>
                  )}
                  {selected && <circle cx={x} cy={y} r={21} className="station-selected" />}
                  <text x={x} y={labelSide === 'below' ? y + LABEL_BELOW : y - LABEL_ABOVE} textAnchor="middle" className={`station-label ${active ? 'active' : ''}`}>
                    <title>{task.title}</title>
                    {shorten(task.title)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <g className="origin" onClick={onBackground}>
        <rect x={layout.origin.x - ORIGIN_R} y={layout.origin.top - ORIGIN_R} width={2 * ORIGIN_R} height={layout.origin.bottom - layout.origin.top + 2 * ORIGIN_R} rx={ORIGIN_R} className="origin-station" />
        <text x={layout.origin.x - ORIGIN_R - ORIGIN_LABEL_GAP} y={layout.origin.y + 6} textAnchor="end" className="origin-name">
          <title>{t('map.origin', { app: appName })}</title>
          {shorten(t('map.origin', { app: appName }))}
        </text>
      </g>
    </>
  );
});

export function LineRoundel({ x, y, code }: { readonly x: number; readonly y: number; readonly code: string }) {
  return (
    <>
      <circle cx={x} cy={y} r={ROUNDEL_RADIUS} className="line-roundel" />
      <text x={x} y={y + 6} textAnchor="middle" className="line-code">
        {code}
      </text>
    </>
  );
}
