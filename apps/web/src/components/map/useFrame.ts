import { useLayoutEffect, useState } from 'react';
import type { Frame } from '../../network/camera';

export const FALLBACK_FRAME: Frame = { width: 970, height: 485 };

const measure = (element: HTMLElement): Frame =>
  element.clientWidth > 0 && element.clientHeight > 0 ? { width: element.clientWidth, height: element.clientHeight } : FALLBACK_FRAME;

export function useFrame(element: HTMLElement | null): Frame {
  const [frame, setFrame] = useState(FALLBACK_FRAME);
  useLayoutEffect(() => {
    if (!element) return;
    const update = (): void => {
      const next = measure(element);
      setFrame((previous) => (previous.width === next.width && previous.height === next.height ? previous : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return frame;
}
