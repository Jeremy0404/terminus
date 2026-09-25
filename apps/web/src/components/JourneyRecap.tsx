import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { changesSince, readJourney, saveJourney, snapshot } from '../state/journey';

interface Props {
  readonly network: NetworkDto;
  readonly taskId: string | null;
  readonly hidden?: boolean;
  readonly onOpen: (line: string, task: string) => void;
}

export function JourneyRecap({ network, taskId, hidden = false, onOpen }: Props) {
  const { t } = useTranslation();
  const [previous, setPrevious] = useState(() => readJourney(network.app.id));
  useEffect(() => {
    const lastTask = taskId ?? readJourney(network.app.id)?.lastTask ?? null;
    saveJourney(network.app.id, snapshot(network, lastTask));
  }, [network, taskId]);
  const changes = changesSince(network, previous);
  const resume = network.tasks.find((task) => task.id === previous?.lastTask);
  const changed = changes.completed + changes.closed + changes.added + changes.attention > 0;
  if (hidden || taskId || (!changed && !resume)) return null;
  return (
    <section className="journey-recap" aria-label={t('journey.title')}>
      <div>
        {changed && <><h2>{t('journey.title')}</h2><p>{Object.entries(changes).filter(([, count]) => count > 0).map(([kind, count]) => t(`journey.${kind}`, { count })).join(' · ')}</p></>}
        {resume && <button type="button" className="btn small" onClick={() => onOpen(resume.epicId, resume.id)}>{t('journey.resume', { title: resume.title })}</button>}
      </div>
      {changed && <button type="button" className="btn small subtle" onClick={() => setPrevious(snapshot(network, previous?.lastTask ?? null))}>{t('journey.dismiss')}</button>}
    </section>
  );
}
