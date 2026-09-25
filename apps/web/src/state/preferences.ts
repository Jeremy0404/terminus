import { useCallback, useState } from 'react';

const HIDE_DELIVERED_KEY = 'terminus:hide-delivered';

function readHideDelivered(): boolean {
  try {
    return window.localStorage.getItem(HIDE_DELIVERED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberHideDelivered(hide: boolean): void {
  try {
    window.localStorage.setItem(HIDE_DELIVERED_KEY, String(hide));
  } catch {
    // Browser storage is optional.
  }
}

export function useHideDelivered(): [boolean, (hide: boolean) => void] {
  const [hide, setHide] = useState(readHideDelivered);
  const update = useCallback((next: boolean) => {
    rememberHideDelivered(next);
    setHide(next);
  }, []);
  return [hide, update];
}
