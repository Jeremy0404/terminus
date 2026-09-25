import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { canvasFor, lineView, mapHeight, networkView, reveal, viewOf, type Canvas, type Frame, type ViewBox } from '../network/camera';
import { layoutNetwork, STEP, withoutDeliveredLines, type NetworkLayout } from '../network/layout';
import { levelOf, type Place } from '../state/location';
import { useHideDelivered } from '../state/preferences';
import { MapDrawing } from './map/MapDrawing';
import { PinnedRoundels } from './map/PinnedRoundels';
import { useDragPan } from './map/useDragPan';
import { useFrame } from './map/useFrame';

const ZOOM_MS = 520;

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly onLine: (epicId: string) => void;
  readonly onStation: (epicId: string, taskId: string) => void;
  readonly onBackground: () => void;
}

interface Shown {
  readonly box: HTMLDivElement;
  readonly app: string;
  readonly line: string | null;
  readonly task: string | null;
  readonly frame: Frame;
}

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function between([x0, y0, width0, height0]: ViewBox, [x1, y1, width1, height1]: ViewBox, progress: number): ViewBox {
  const mix = (from: number, to: number): number => from + (to - from) * ease(progress);
  return [mix(x0, x1), mix(y0, y1), mix(width0, width1), mix(height0, height1)];
}
const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

function paint(svg: SVGSVGElement, box: HTMLDivElement, canvas: Canvas): void {
  svg.setAttribute('viewBox', canvas.viewBox.join(' '));
  svg.setAttribute('width', String(canvas.width));
  svg.setAttribute('height', String(canvas.height));
  box.scrollLeft = canvas.scrollLeft;
  box.scrollTop = canvas.scrollTop;
}

export function NetworkMap({ network, place, onLine, onStation, onBackground }: Props) {
  const { t } = useTranslation();
  const [hideDelivered, setHideDelivered] = useHideDelivered();
  const anyDelivered = network.epics.some((epic) => epic.status === 'delivered');
  const layout = useMemo(() => {
    const visible = hideDelivered ? withoutDeliveredLines(network.epics, network.tasks, place.line) : network;
    return layoutNetwork(visible.epics, visible.tasks);
  }, [network, hideDelivered, place.line]);
  const svg = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const frame = useFrame(box);
  const canvas = useRef<Canvas | null>(null);
  const shown = useRef<Shown | null>(null);
  const animation = useRef<number | null>(null);
  const layoutNow = useRef<NetworkLayout>(layout);
  const [view, setView] = useState<ViewBox | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const level = levelOf(place);
  const stopZoom = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);
  const pan = useDragPan(box, stopZoom);

  useLayoutEffect(() => {
    const resized = layoutNow.current.width !== layout.width || layoutNow.current.height !== layout.height;
    layoutNow.current = layout;
    const element = svg.current;
    if (!resized || !box || !element || !canvas.current || animation.current !== null || shown.current?.box !== box) return;
    const current = viewOf(canvas.current, { left: box.scrollLeft, top: box.scrollTop }, frame);
    canvas.current = canvasFor(current, layout, frame);
    paint(element, box, canvas.current);
    setView(current);
  }, [layout, box, frame]);

  useLayoutEffect(() => {
    const element = svg.current;
    if (!box || !element) return;
    const appId = network.app.id;
    const previous = shown.current;
    shown.current = { box, app: appId, line: place.line, task: place.task, frame };
    const from = previous?.box === box && canvas.current ? viewOf(canvas.current, { left: box.scrollLeft, top: box.scrollTop }, frame) : null;
    const resized = previous?.frame !== frame;
    const target = layoutNow.current;
    const base = !from || resized || previous?.app !== appId || previous?.line !== place.line
      ? (place.line ? lineView(target, place.line, frame) : networkView(target, frame))
      : from;
    const selected = target.lines.flatMap((line) => line.stations).find((station) => station.task.id === place.task);
    const to = selected ? reveal(base, selected, STEP) : base;
    const show = (view: ViewBox): void => {
      canvas.current = canvasFor(view, layoutNow.current, frame);
      paint(element, box, canvas.current);
      setView(view);
    };
    if (!from || resized || prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      show(to);
      return;
    }
    let started: number | null = null;
    const step = (now: number): void => {
      started ??= now;
      const progress = Math.min(1, (now - started) / ZOOM_MS);
      show(between(from, to, progress));
      animation.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    animation.current = requestAnimationFrame(step);
    return stopZoom;
  }, [box, network.app.id, place.line, place.task, frame, stopZoom]);

  const followScroll = useCallback(() => {
    if (scrollFrame.current !== null || typeof requestAnimationFrame === 'undefined') return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (box && canvas.current) setView(viewOf(canvas.current, { left: box.scrollLeft, top: box.scrollTop }, frame));
    });
  }, [box, frame]);

  useLayoutEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  const allHidden = layout.lines.length === 0 && network.epics.length > 0;

  return (
    <>
      {anyDelivered && (
        <button type="button" className="map-toggle" aria-pressed={hideDelivered} onClick={() => setHideDelivered(!hideDelivered)}>
          {t('map.hideDelivered')}
        </button>
      )}
      {allHidden ? (
        <p className="map-empty">{t('map.allDelivered')}</p>
      ) : (
        <div
          ref={setBox}
          className={`map-viewport ${pan.dragging ? 'dragging' : ''}`}
          style={{ height: mapHeight(layout, frame.width) }}
          onPointerDown={pan.onPointerDown}
          onClickCapture={pan.onClickCapture}
          onScroll={followScroll}
        >
          <svg ref={svg} className="network-map" preserveAspectRatio="xMinYMin meet" role="img" aria-label={t('map.label', { app: network.app.name })}>
            <rect className="map-background" x={-5000} y={-5000} width={10000} height={10000} onClick={onBackground} />
            <MapDrawing layout={layout} appName={network.app.name} tasks={network.tasks} level={level} openLine={place.line} selectedTask={place.task} onLine={onLine} onStation={onStation} onBackground={onBackground} />
            {view && <PinnedRoundels layout={layout} view={view} level={level} openLine={place.line} onLine={onLine} />}
          </svg>
        </div>
      )}
    </>
  );
}
