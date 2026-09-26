import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto } from '@terminus/contracts';
import { VIEWS, type Place, type View } from '../state/location';
import { Trip } from './Trip';

interface Props {
  readonly network: NetworkDto;
  readonly place: Place;
  readonly view: View;
  readonly go: (place: Place, view?: View) => void;
  readonly children: ReactNode;
}

export function JourneyFrame({ network, place, view, go, children }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <nav className="journey-nav" aria-label={t('pocket.label')}>
        {VIEWS.map((item) => <button className="btn" key={item} aria-current={view === item ? 'page' : undefined} onClick={() => go({ app: place.app, line: null, task: null }, item)}>{t(`pocket.${item}`)}</button>)}
      </nav>
      <Trip network={network} place={place} go={go} />
      {children}
    </>
  );
}
