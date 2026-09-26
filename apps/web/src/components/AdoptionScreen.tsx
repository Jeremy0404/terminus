import { AdoptionWizard } from './adoption/AdoptionWizard';

interface Props {
  readonly onCancel: () => void;
  readonly onAdopted: (appId: string) => void;
}

export function AdoptionScreen({ onCancel, onAdopted }: Props) {
  return (
    <div className="adoption-stage">
      <AdoptionWizard onCancel={onCancel} onAdopted={onAdopted} />
    </div>
  );
}
