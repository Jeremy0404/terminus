import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

const DRAG_THRESHOLD = 5;
const PRIMARY_BUTTON = 0;

export function useDragPan(box: HTMLElement | null, onPanStart: () => void) {
  const [dragging, setDragging] = useState(false);
  const swallowClick = useRef(false);
  const release = useRef<(() => void) | null>(null);

  useEffect(() => () => release.current?.(), []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      swallowClick.current = false;
      if (!box || event.pointerType !== 'mouse' || event.button !== PRIMARY_BUTTON) return;
      const start = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
      let panning = false;
      const move = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - start.x;
        const dy = moveEvent.clientY - start.y;
        if (!panning && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!panning) {
          panning = true;
          swallowClick.current = true;
          setDragging(true);
          onPanStart();
        }
        box.scrollLeft = start.left - dx;
        box.scrollTop = start.top - dy;
      };
      const stop = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        release.current = null;
        setDragging(false);
      };
      release.current?.();
      release.current = stop;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [box, onPanStart],
  );

  const onClickCapture = useCallback((event: MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
  }, []);

  return { dragging, onPointerDown, onClickCapture };
}
