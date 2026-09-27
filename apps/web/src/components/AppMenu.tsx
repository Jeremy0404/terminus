import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppDto } from '@terminus/contracts';

interface Props {
  readonly apps: readonly AppDto[];
  readonly current: AppDto | null;
  readonly onSelect: (appId: string) => void;
  readonly onAdopt: () => void;
  readonly onFound: () => void;
  readonly memoryProposals: number;
  readonly staleSkills: number;
  readonly canNotify: boolean;
  readonly onMemory: () => void;
  readonly onSettings: () => void;
  readonly onNotify: () => void;
}

export function AppMenu({ apps, current, onSelect, onAdopt, onFound, memoryProposals, staleSkills, canNotify, onMemory, onSettings, onNotify }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    const onPointer = (event: PointerEvent): void => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const choose = (action: () => void) => (): void => {
    setOpen(false);
    action();
  };

  return (
    <div className="app-selector" ref={wrapper}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{current?.name ?? t('apps.none')}</b>
        {(memoryProposals > 0 || staleSkills > 0) && <span className="attention-dot" role="img" aria-label={t('appMenu.attention')} />}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="app-menu" role="menu">
          {current && (
            <button type="button" role="menuitem" className="menu-entry" onClick={choose(onMemory)}>
              {t('memory.open')}
              {memoryProposals > 0 && <span className="badge" aria-label={t('memory.pending', { count: memoryProposals })}>{memoryProposals}</span>}
            </button>
          )}
          <button type="button" role="menuitem" className="menu-entry" onClick={choose(onSettings)}>
            {t('settings.open')}
            {staleSkills > 0 && <span className="badge" aria-label={t('ritual.pending', { count: staleSkills })}>{staleSkills}</span>}
          </button>
          {canNotify && (
            <button type="button" role="menuitem" className="menu-entry" onClick={choose(onNotify)}>
              {t('notify.enable')}
            </button>
          )}
          <hr />
          {apps.length > 0 && (
            <div role="group" aria-label={t('appMenu.apps')} className="app-menu-apps">
              {apps.map((app) => (
                <button key={app.id} type="button" role="menuitem" aria-current={app.id === current?.id} onClick={choose(() => onSelect(app.id))}>
                  <b>{app.name}</b>
                  <small>{app.repoPath}</small>
                </button>
              ))}
            </div>
          )}
          <button type="button" role="menuitem" className="menu-adopt" onClick={choose(onFound)}>
            <b>{t('found.open')}</b>
          </button>
          <button type="button" role="menuitem" className="menu-adopt" onClick={choose(onAdopt)}>
            <b>{t('adopt.open')}</b>
          </button>
        </div>
      )}
    </div>
  );
}
