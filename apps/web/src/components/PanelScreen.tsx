import type { ReactNode } from 'react';
import type { NetworkDto } from '@terminus/contracts';
import type { Place } from '../state/location';
import { Trip } from './Trip';

interface Props {
  readonly network: NetworkDto | null;
  readonly place: Place;
  readonly go: (place: Place) => void;
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function PanelScreen({ network, place, go, label, onClose, children }: Props) {
  return (
    <>
      {network && <Trip network={network} place={place} go={go} panel={{ label, onClose }} />}
      <div className="adoption-stage">{children}</div>
    </>
  );
}
