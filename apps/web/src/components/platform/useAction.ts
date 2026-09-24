import { useState } from 'react';
import { activity } from '../../state/activity';

function clickedButton(): HTMLButtonElement | null {
  return document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
}

export function useAction(): { readonly busy: boolean; readonly error: string | null; readonly run: (action: () => Promise<unknown>) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    const source = clickedButton();
    const label = source?.textContent?.trim() ?? '';
    source?.setAttribute('aria-busy', 'true');
    const end = activity.begin();
    setBusy(true);
    setError(null);
    try {
      await action();
      if (label) activity.done(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      end();
      source?.removeAttribute('aria-busy');
      setBusy(false);
    }
  };
  return { busy, error, run };
}
