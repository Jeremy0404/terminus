import { IdeasWorkshop } from './IdeasWorkshop';

interface Props {
  readonly onCancel: () => void;
  readonly onFounded: (id: string) => void;
}

export function FoundingScreen({ onCancel, onFounded }: Props) {
  return (
    <div className="adoption-stage">
      <IdeasWorkshop onCancel={onCancel} onFounded={onFounded} />
    </div>
  );
}
