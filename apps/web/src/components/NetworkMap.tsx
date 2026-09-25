import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { fullViewBox, layoutNetwork, lineViewBox } from '../network/layout';
import { levelOf, type Place } from '../state/location';
import { MapDrawing } from './map/MapDrawing';

const MAP_ASPECT = 2;
const ZOOM_MS = 520;

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
      <MapDrawing layout={layout} tasks={network.tasks} level={level} openLine={place.line} selectedTask={place.task} onLine={onLine} onStation={onStation} />
    </svg>
  );
}
