import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { canvasFor, fittedCanvas, fittedLineHeight, fittedLineView, mapHeight, networkView, stationView, viewOf, wrapColumns, type Canvas, type Frame, type ViewBox } from '../network/camera';
import { compactNetwork } from '../network/compact';
import { layoutNetwork, withoutDeliveredLines, type NetworkLayout } from '../network/layout';
import { levelOf, type Level, type Place } from '../state/location';
import { useHideDelivered } from '../state/preferences';
import { MapDrawing } from './map/MapDrawing';
import { PinnedRoundels } from './map/PinnedRoundels';
import { useDragPan } from './map/useDragPan';
import { useFrame } from './map/useFrame';

const ZOOM_MS = 520;
export const STATION_BAND_HEIGHT = 150;
const FADE_MS = 200;
const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

interface Props {
  readonly collapseFinished?: boolean;
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
  readonly level: Level;
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

export function NetworkMap({ network, place, onLine, onStation, onBackground, collapseFinished = true }: Props) {
  const { t } = useTranslation();
  const [hideDelivered, setHideDelivered] = useHideDelivered();
  const level = levelOf(place);
  const anyDelivered = level !== 'platform' && collapseFinished && withoutDeliveredLines(network.epics, network.tasks, null).epics.length < network.epics.length;
  const overview = useMemo(() => {
    const visible = collapseFinished && hideDelivered ? withoutDeliveredLines(network.epics, network.tasks, null) : network;
    const shown = collapseFinished ? compactNetwork(visible.epics, visible.tasks) : { ...visible, counts: NO_COUNTS, thin: NO_COUNTS };
    return { layout: layoutNetwork(shown.epics, shown.tasks, new Set(shown.thin.keys())), counts: shown.counts, thin: shown.thin };
  }, [network, hideDelivered, collapseFinished]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const frame = useFrame(box);
  const fitted = level !== 'platform';
  const columns = level === 'line' ? wrapColumns(frame.width) : null;
  const full = useMemo(() => {
    if (place.line === null) return null;
    const visible = collapseFinished && hideDelivered ? withoutDeliveredLines(network.epics, network.tasks, place.line) : network;
    return layoutNetwork(visible.epics, visible.tasks, new Set(), columns === null ? undefined : { epicId: place.line, columns });
  }, [network, hideDelivered, place.line, collapseFinished, columns]);
  const layout = full ?? overview.layout;
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<Canvas | null>(null);
  const shown = useRef<Shown | null>(null);
  const animation = useRef<number | null>(null);
  const layoutNow = useRef<NetworkLayout>(layout);
  const placeNow = useRef({ level, line: place.line });
  const [view, setView] = useState<ViewBox | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const fittedView = useCallback(
    (target: NetworkLayout): ViewBox => (place.line === null ? networkView(target, frame) : fittedLineView(target, place.line, frame)),
    [place.line, frame],
  );
  const stopZoom = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);
  const pan = useDragPan(box, stopZoom);

  useLayoutEffect(() => {
    const resized = layoutNow.current.width !== layout.width || layoutNow.current.height !== layout.height;
    const moved = placeNow.current.level !== level || placeNow.current.line !== place.line;
    const changed = layoutNow.current !== layout;
    layoutNow.current = layout;
    placeNow.current = { level, line: place.line };
    const element = svg.current;
    if (!(fitted ? changed : resized) || moved || !box || !element || !canvas.current || animation.current !== null || shown.current?.box !== box) return;
    const current = fitted ? fittedView(layout) : viewOf(canvas.current, { left: box.scrollLeft, top: box.scrollTop }, frame);
    canvas.current = fitted ? fittedCanvas(current, frame) : canvasFor(current, layout, frame);
    paint(element, box, canvas.current);
    setView(current);
  }, [layout, level, place.line, fitted, fittedView, box, frame]);

  useLayoutEffect(() => {
    const element = svg.current;
    if (!box || !element) return;
    const appId = network.app.id;
    const previous = shown.current;
    shown.current = { box, app: appId, line: place.line, task: place.task, level, frame };
    const from = previous?.box === box && canvas.current ? viewOf(canvas.current, { left: box.scrollLeft, top: box.scrollTop }, frame) : null;
    const resized = previous?.frame !== frame;
    const target = layoutNow.current;
    const to = fitted ? fittedView(target) : place.line && place.task ? stationView(target, place.line, place.task, frame) : networkView(target, frame);
    const show = (view: ViewBox): void => {
      canvas.current = fitted ? fittedCanvas(view, frame) : canvasFor(view, layoutNow.current, frame);
      paint(element, box, canvas.current);
      setView(view);
    };
    const wasFitted = previous?.level !== 'platform';
    const redrawn = from !== null && (wasFitted !== fitted || (fitted && previous?.line !== place.line));
    if (redrawn) {
      show(to);
      if (!prefersReducedMotion()) element.animate?.(FADE_IN, FADE_MS);
      return;
    }
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
  }, [box, network.app.id, place.line, place.task, level, fitted, fittedView, frame, stopZoom]);

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
  const networkHeight = mapHeight(overview.layout, frame.width);
  const height = level === 'platform' ? STATION_BAND_HEIGHT : level === 'line' && place.line !== null ? Math.max(networkHeight, fittedLineHeight(layout, place.line)) : networkHeight;

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
          className={`map-viewport ${fitted ? 'fitted' : ''} ${pan.dragging ? 'dragging' : ''}`}
          style={{ height }}
          onPointerDown={fitted ? undefined : pan.onPointerDown}
          onClickCapture={fitted ? undefined : pan.onClickCapture}
          onScroll={fitted ? undefined : followScroll}
        >
          <svg ref={svg} className="network-map" preserveAspectRatio="xMinYMin meet" role="img" aria-label={t('map.label', { app: network.app.name })}>
            <rect className="map-background" x={-5000} y={-5000} width={10000} height={10000} onClick={onBackground} />
            <MapDrawing layout={layout} counts={full ? NO_COUNTS : overview.counts} thin={full ? NO_COUNTS : overview.thin} appName={network.app.name} tasks={network.tasks} level={level} openLine={place.line} selectedTask={place.task} onLine={onLine} onStation={onStation} onBackground={onBackground} />
            {view && level !== 'network' && <PinnedRoundels layout={layout} view={view} level={level} openLine={place.line} onLine={onLine} />}
          </svg>
        </div>
      )}
    </>
  );
}
