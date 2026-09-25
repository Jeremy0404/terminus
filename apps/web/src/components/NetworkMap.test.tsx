import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EpicDto, NetworkDto, TaskSummaryDto } from '@terminus/contracts';
import { LEFT, STEP } from '../network/layout';
import { APP, NETWORK, task } from '../test/fixtures';
import type { Place } from '../state/location';
import { NetworkMap } from './NetworkMap';

const NETWORK_PLACE: Place = { app: 'app-1', line: null, task: null };

const withDelivered = (network: NetworkDto, ...ids: string[]): NetworkDto => ({
  ...network,
  epics: network.epics.map((epic) => (ids.includes(epic.id) ? { ...epic, status: 'delivered' } : epic)),
});

function renderMap(network: NetworkDto, place: Place = NETWORK_PLACE) {
  return render(<NetworkMap network={network} place={place} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);
}

const hideToggle = () => screen.queryByRole('button', { name: 'Masquer les lignes livrées' });

beforeEach(() => window.localStorage.clear());

describe('NetworkMap delivered lines', () => {
  it('offers no toggle while no line is delivered', () => {
    renderMap(NETWORK);
    expect(hideToggle()).not.toBeInTheDocument();
  });

  it('hides and shows delivered lines with the toggle', () => {
    renderMap(withDelivered(NETWORK, 'engine'));
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();

    fireEvent.click(hideToggle() as HTMLElement);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Ligne Moteur' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ligne Interface' })).toBeInTheDocument();

    fireEvent.click(hideToggle() as HTMLElement);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
  });

  it('remembers the choice across a reload', () => {
    const network = withDelivered(NETWORK, 'engine');
    const first = renderMap(network);
    fireEvent.click(hideToggle() as HTMLElement);
    first.unmount();

    renderMap(network);
    expect(hideToggle()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Ligne Moteur' })).not.toBeInTheDocument();
  });

  it('keeps the open line on the map even when it is delivered and hidden', () => {
    const network = withDelivered(NETWORK, 'engine');
    const first = renderMap(network);
    fireEvent.click(hideToggle() as HTMLElement);
    first.unmount();

    renderMap(network, { app: 'app-1', line: 'engine', task: null });
    expect(screen.getByRole('button', { name: 'Ligne Moteur' })).toBeInTheDocument();
  });

  it('says so instead of drawing an empty map when every line is delivered and hidden', () => {
    renderMap(withDelivered(NETWORK, 'engine', 'ui'));
    fireEvent.click(hideToggle() as HTMLElement);
    expect(screen.getByText('Toutes les lignes sont livrées.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

const FRAME_WIDTH = 970;
const line = (id: string, position: number): EpicDto => ({ id, appId: APP.id, code: id.toUpperCase(), name: id, status: 'active', position, description: '', breakdown: { status: 'idle' } });
const stations = (epicId: string, count: number, done = 0): TaskSummaryDto[] =>
  Array.from({ length: count }, (_, index) => task(`${epicId}${index + 1}`, epicId, `${epicId} ${index + 1}`, index < done ? { kind: 'done' } : { kind: 'todo' }));
const networkOf = (epics: EpicDto[], tasks: TaskSummaryDto[]): NetworkDto => ({ app: APP, epics, tasks, inbox: [], memoryProposals: 0 });
const manyLines = (count: number): NetworkDto => {
  const epics = Array.from({ length: count }, (_, index) => line(`l${index + 1}`, index + 1));
  return networkOf(epics, epics.flatMap((epic) => stations(epic.id, 1)));
};

function drawn(container: HTMLElement) {
  const svg = container.querySelector('svg.network-map') as SVGSVGElement;
  const box = container.querySelector('.map-viewport') as HTMLElement;
  const [x = 0, y = 0, width = 0, height = 0] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  const pixelWidth = Number(svg.getAttribute('width'));
  const pixelHeight = Number(svg.getAttribute('height'));
  const scale = pixelWidth / width;
  return {
    box,
    scale,
    pixelHeight,
    viewBoxHeight: height,
    showsX: (unitX: number): boolean => {
      const px = (unitX - x) * scale;
      return px >= box.scrollLeft && px <= box.scrollLeft + FRAME_WIDTH;
    },
    y,
  };
}

const stationX = (index: number): number => LEFT + index * STEP;

describe('NetworkMap scale and scroll', () => {
  it('draws twenty lines at the same scale as one, taller than the box', () => {
    const one = drawn(renderMap(manyLines(1)).container);
    const oneRatio = one.pixelHeight / one.viewBoxHeight;
    const twenty = drawn(renderMap(manyLines(20)).container);

    expect(twenty.pixelHeight / twenty.viewBoxHeight).toBeCloseTo(oneRatio);
    expect(twenty.pixelHeight).toBeGreaterThan(FRAME_WIDTH / 2);
  });

  it('opens a long line on its first unfinished station', () => {
    const network = networkOf([line('a', 1)], stations('a', 30, 20));
    const map = drawn(renderMap(network, { app: APP.id, line: 'a', task: null }).container);

    expect(map.box.scrollLeft).toBeGreaterThan(0);
    expect(map.showsX(stationX(20))).toBe(true);
  });

  it('opens a line on its start when its first station is unfinished', () => {
    const network = networkOf([line('a', 1)], stations('a', 30));
    const map = drawn(renderMap(network, { app: APP.id, line: 'a', task: null }).container);

    expect(map.box.scrollLeft).toBe(0);
    expect(map.showsX(stationX(0))).toBe(true);
  });

  it('brings a station selected from outside the map into view', () => {
    const network = networkOf([line('a', 1)], stations('a', 30));
    const view = renderMap(network, { app: APP.id, line: 'a', task: null });
    view.rerender(<NetworkMap network={network} place={{ app: APP.id, line: 'a', task: 'a30' }} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);

    expect(drawn(view.container).showsX(stationX(29))).toBe(true);
  });

  it('keeps the scroll of the user when a status changes', () => {
    const network = networkOf([line('a', 1)], stations('a', 30));
    const place = { app: APP.id, line: 'a', task: null };
    const view = renderMap(network, place);
    const { box } = drawn(view.container);
    box.scrollLeft = 300;

    const updated = { ...network, tasks: network.tasks.map((candidate) => (candidate.id === 'a1' ? { ...candidate, status: { kind: 'done' as const } } : candidate)) };
    view.rerender(<NetworkMap network={updated} place={place} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);

    expect(box.scrollLeft).toBe(300);
  });

  it('shows the top-left of the network again when leaving a line', () => {
    const network = networkOf([line('a', 1), line('b', 2)], [...stations('a', 2), ...stations('b', 30, 20)]);
    const view = renderMap(network, { app: APP.id, line: 'b', task: null });
    expect(drawn(view.container).box.scrollLeft).toBeGreaterThan(0);

    view.rerender(<NetworkMap network={network} place={NETWORK_PLACE} onLine={vi.fn()} onStation={vi.fn()} onBackground={vi.fn()} />);
    const map = drawn(view.container);
    expect([map.box.scrollLeft, map.box.scrollTop]).toEqual([0, 0]);
    expect(map.showsX(0)).toBe(true);
  });
});

describe('NetworkMap drag to pan', () => {
  const network = networkOf([line('a', 1)], stations('a', 30));
  const place = { app: APP.id, line: 'a', task: null };

  function renderWithSpies() {
    const onStation = vi.fn();
    const onBackground = vi.fn();
    const view = render(<NetworkMap network={network} place={place} onLine={vi.fn()} onStation={onStation} onBackground={onBackground} />);
    return { ...view, box: drawn(view.container).box, onStation, onBackground };
  }

  function drag(target: Element, by: number, pointerType = 'mouse') {
    fireEvent.pointerDown(target, { pointerType, button: 0, clientX: 500, clientY: 200 });
    fireEvent.pointerMove(window, { pointerType, clientX: 500 - by, clientY: 200 });
    fireEvent.pointerUp(window, { pointerType, clientX: 500 - by, clientY: 200 });
    fireEvent.click(target);
  }

  it('pans the map when dragging from a station, without opening it', () => {
    const { box, onStation } = renderWithSpies();
    drag(screen.getByRole('button', { name: /^a 1,/ }), 40);

    expect(box.scrollLeft).toBe(40);
    expect(onStation).not.toHaveBeenCalled();
  });

  it('does not leave the line when dragging across the background', () => {
    const { container, onBackground } = renderWithSpies();
    drag(container.querySelector('.map-background') as Element, 40);

    expect(onBackground).not.toHaveBeenCalled();
  });

  it('still opens a station on a click with a little jitter', () => {
    const { onStation } = renderWithSpies();
    drag(screen.getByRole('button', { name: /^a 1,/ }), 2);

    expect(onStation).toHaveBeenCalledWith('a', 'a1');
  });

  it('leaves touch panning to the browser', () => {
    const { box } = renderWithSpies();
    drag(screen.getByRole('button', { name: /^a 1,/ }), 40, 'touch');

    expect(box.scrollLeft).toBe(0);
  });
});

describe('NetworkMap pinned roundels', () => {
  const network = networkOf([line('a', 1), line('b', 2)], [...stations('a', 30), ...stations('b', 30)]);

  function scrollRight(container: HTMLElement) {
    const { box } = drawn(container);
    box.scrollLeft += 400;
    fireEvent.scroll(box);
  }

  it('pins the roundel of a line scrolled past its start, and it opens the line', async () => {
    const onLine = vi.fn();
    const { container } = render(<NetworkMap network={network} place={NETWORK_PLACE} onLine={onLine} onStation={vi.fn()} onBackground={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'Ligne a' })).toHaveLength(1);

    scrollRight(container);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ligne a' })).toHaveLength(2));

    const pin = container.querySelector('.pinned-roundel[aria-label="Ligne a"]') as Element;
    fireEvent.click(pin);
    expect(onLine).toHaveBeenCalledWith('a');
  });

  it('dims the pins of the other lines in line view', async () => {
    const { container } = renderMap(network, { app: APP.id, line: 'a', task: null });
    scrollRight(container);

    await waitFor(() => expect(container.querySelectorAll('.pinned-roundel')).toHaveLength(2));
    expect(container.querySelector('.pinned-roundel[aria-label="Ligne a"]')).not.toHaveClass('dim');
    expect(container.querySelector('.pinned-roundel[aria-label="Ligne b"]')).toHaveClass('dim');
  });
});
