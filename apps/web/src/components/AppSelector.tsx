import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppDto } from '@terminus/contracts';

interface Props {
  readonly apps: readonly AppDto[];
  readonly current: AppDto | null;
  readonly onSelect: (appId: string) => void;
}

export function AppSelector({ apps, current, onSelect }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-selector">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{current?.name ?? t('apps.none')}</b>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="app-menu" role="menu">
          {apps.map((app) => (
            <button key={app.id} type="button" role="menuitem" aria-current={app.id === current?.id}
              onClick={() => {
                setOpen(false);
                onSelect(app.id);
              }}>
              <b>{app.name}</b>
              <small>{app.repoPath}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
