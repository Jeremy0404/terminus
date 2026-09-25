import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskSummaryDto } from '@terminus/contracts';
import { ROUNDEL_OFFSET, ROUNDEL_RADIUS, type NetworkLayout } from '../../network/layout';
import { lineColor } from '../../network/line-colors';
import { isActive, statusKey, toneOf } from '../../network/tone';
import type { Level } from '../../state/location';

const LABEL_CHARS = 18;

interface Props {
  readonly layout: NetworkLayout;
  readonly tasks: readonly TaskSummaryDto[];
  readonly level: Level;
  readonly openLine: string | null;
  readonly selectedTask: string | null;
  readonly onLine: (epicId: string) => void;
  readonly onStation: (epicId: string, taskId: string) => void;
}

export const MapDrawing = memo(function MapDrawing({ layout, tasks, level, openLine, selectedTask, onLine, onStation }: Props) {
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
            <line x1={transfer.from.x} y1={transfer.from.y} x2={transfer.to.x} y2={transfer.to.y} className="transfer-outer" />
            <line x1={transfer.from.x} y1={transfer.from.y} x2={transfer.to.x} y2={transfer.to.y} className="transfer-inner" />
          </g>
        );
      })}
      {layout.lines.map((line) => {
        const color = lineColor(line.epic.position);
        const planned = line.epic.status === 'planned';
        const done = line.stations.filter((station) => station.task.status.kind === 'done').length;
        return (
          <g key={line.epic.id} className={`line ${dimmed(line.epic.id) ? 'dim' : ''}`} style={{ color }}>
            <g className="line-hit" role="button" tabIndex={0} aria-label={t('map.line', { name: line.epic.name })} onClick={() => onLine(line.epic.id)}
              onKeyDown={(event) => event.key === 'Enter' && onLine(line.epic.id)}>
              <line x1={line.startX} y1={line.y} x2={line.endX} y2={line.y} className="line-hit-area" />
              <line x1={line.startX} y1={line.y} x2={line.endX} y2={line.y} className={`line-track ${planned ? 'planned' : ''}`} />
              <line x1={line.endX} y1={line.y - 13} x2={line.endX} y2={line.y + 13} className="line-terminus" />
              <LineRoundel x={line.startX - ROUNDEL_OFFSET} y={line.y} code={line.epic.code} />
              <text x={line.startX - 70} y={line.y + 6} textAnchor="end" className="line-name">
                {line.epic.name}
              </text>
              <text x={line.startX - 70} y={line.y + 22} textAnchor="end" className="line-meta">
                {planned ? t('map.planned') : t('map.progress', { done, total: line.stations.length })}
              </text>
            </g>
            {line.stations.map(({ task, x, y }) => {
              const tone = toneOf(task.status);
              const active = isActive(task.status);
              const selected = selectedTask === task.id;
              return (
                <g key={task.id} className={`station tone-${tone}`} role="button" tabIndex={0}
                  aria-label={`${task.title}, ${t(statusKey(task.status))}`}
                  onClick={() => onStation(line.epic.id, task.id)}
                  onKeyDown={(event) => event.key === 'Enter' && onStation(line.epic.id, task.id)}>
                  {(tone === 'signal' || tone === 'stop') && <circle cx={x} cy={y} r={13} className="station-pulse" />}
                  <circle cx={x} cy={y} r={active ? 12 : 9} className="station-dot" />
                  {task.status.kind === 'running' && (
                    <>
                      <rect x={x - 9} y={y - 6} width={18} height={12} rx={6} className="train" />
                      <circle cx={x} cy={y} r={2.5} className="train-light" />
                    </>
                  )}
                  {selected && <circle cx={x} cy={y} r={21} className="station-selected" />}
                  <text x={x} y={y + 32} textAnchor="middle" className={`station-label ${active ? 'active' : ''}`}>
                    <title>{task.title}</title>
                    {task.title.length > LABEL_CHARS ? `${task.title.slice(0, LABEL_CHARS - 1)}…` : task.title}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
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
