import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';
import { levelOf, type Place } from '../state/location';
import { LineBadge } from './LineBadge';

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly go: (place: Place) => void;
  readonly panel?: { readonly label: string; readonly onClose: () => void };
}

export function Trip({ network, place, go: navigate, panel }: Props) {
  const go = (next: Place): void => {
    panel?.onClose();
    navigate(next);
  };
  const { t } = useTranslation();
  const level = levelOf(place);
  const epic = network.epics.find((candidate) => candidate.id === place.line);
  const task = network.tasks.find((candidate) => candidate.id === place.task);
  const networkLabel = t('trip.network', { app: network.app.name });
  return (
    <nav className="trip" aria-label={t('trip.label')}>
      {level === 'network' && !panel ? <span className="trip-current">{networkLabel}</span> : (
        <button type="button" onClick={() => go({ app: place.app, line: null, task: null })}>{networkLabel}</button>
      )}
      {epic && (
        <>
          <span className="trip-sep" style={{ background: lineColor(epic.position) }} />
          {level === 'line' && !panel ? (
            <span className="trip-current"><LineBadge epic={epic} /> {epic.name}</span>
          ) : (
            <button type="button" onClick={() => go({ ...place, task: null })}><LineBadge epic={epic} /> {epic.name}</button>
          )}
        </>
      )}
      {task && epic && (
        <>
          <span className="trip-sep" style={{ background: lineColor(epic.position) }} />
          {panel ? <button type="button" onClick={() => go(place)}>{task.title}</button> : <span className="trip-current">{task.title}</span>}
          {!panel && task.status.kind !== 'done' && task.status.kind !== 'todo' && (
            <>
              <span className="trip-sep" />
              <span className="trip-phase">{t(`phase.${task.phases[task.phaseIndex] ?? ''}`)}</span>
            </>
          )}
        </>
      )}
      {panel && (
        <>
          <span className="trip-sep" />
          <span className="trip-current">{panel.label}</span>
        </>
      )}
      <span className="trip-hint">{level === 'network' && !panel ? t('trip.hintNetwork') : t('trip.hintEscape')}</span>
    </nav>
  );
}
