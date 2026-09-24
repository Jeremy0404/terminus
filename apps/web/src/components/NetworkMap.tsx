import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { fullViewBox, layoutNetwork, lineViewBox } from '../network/layout';
import { lineColor } from '../network/line-colors';
import { isActive, statusKey, toneOf } from '../network/tone';
import { levelOf, type Place } from '../state/location';

const MAP_ASPECT = 2;
const ZOOM_MS = 520;
const LABEL_CHARS = 18;

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly onLine: (epicId: string) => void;
  readonly onStation: (epicId: string, taskId: string) => void;
  readonly onBackground: () => void;
}

export function NetworkMap({ network, place, onLine, onStation, onBackground }: Props) {
  const { t } = useTranslation();
  const layout = useMemo(() => layoutNetwork(network.epics, network.tasks), [network]);
  const svg = useRef<SVGSVGElement>(null);
  const [initialViewBox] = useState(() => fullViewBox(layout).join(' '));
  const current = useRef<number[] | null>(null);
  const level = levelOf(place);
  const target = place.line ? lineViewBox(layout, place.line, MAP_ASPECT) : fullViewBox(layout);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const from = current.current ?? fullViewBox(layout);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    if (reduce || typeof requestAnimationFrame === 'undefined') {
      current.current = target;
      element.setAttribute('viewBox', target.join(' '));
      return;
    }
    let started: number | null = null;
    let frame = 0;
    const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const step = (now: number): void => {
      started ??= now;
      const progress = Math.min(1, (now - started) / ZOOM_MS);
      current.current = from.map((value, index) => value + ((target[index] ?? value) - value) * ease(progress));
      element.setAttribute('viewBox', current.current.join(' '));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join(' ')]);

  const dimmed = (epicId: string): boolean => level !== 'network' && place.line !== epicId;

  return (
    <svg
      ref={svg}
      className="network-map"
      viewBox={initialViewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t('map.label', { app: network.app.name })}
    >
      <rect className="map-background" x={-5000} y={-5000} width={10000} height={10000} onClick={onBackground} />
      {layout.transfers.map((transfer) => {
        const fromEpic = network.tasks.find((task) => task.id === transfer.fromTaskId)?.epicId ?? '';
        const toEpic = network.tasks.find((task) => task.id === transfer.toTaskId)?.epicId ?? '';
        const dim = level !== 'network' && place.line !== fromEpic && place.line !== toEpic;
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
              <circle cx={line.startX - 44} cy={line.y} r={17} className="line-roundel" />
              <text x={line.startX - 44} y={line.y + 6} textAnchor="middle" className="line-code">
                {line.epic.code}
              </text>
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
              const selected = place.task === task.id;
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
    </svg>
  );
}
