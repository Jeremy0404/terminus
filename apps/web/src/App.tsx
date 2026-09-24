import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HealthResponse } from '@terminus/contracts';

type DaemonState = { kind: 'checking' } | { kind: 'online'; version: string } | { kind: 'offline' };

export function App() {
  const { t } = useTranslation();
  const [daemon, setDaemon] = useState<DaemonState>({ kind: 'checking' });

  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => HealthResponse.parse(await response.json()))
      .then((health) => setDaemon({ kind: 'online', version: health.version }))
      .catch(() => setDaemon({ kind: 'offline' }));
  }, []);

  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p role="status">
        {daemon.kind === 'online'
          ? t('app.daemon.online', { version: daemon.version })
          : t(`app.daemon.${daemon.kind}`)}
      </p>
    </main>
  );
}
