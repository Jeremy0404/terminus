import type { NetworkDto } from '@terminus/contracts';
import { NetworkSummary } from './NetworkSummary';
import { ProductionCard } from './ProductionCard';

interface Props {
  readonly network: NetworkDto;
  readonly onLine: (line: string) => void;
  readonly onStation: (line: string, task: string) => void;
  readonly onMemory: () => void;
}

export function NetworkRail({ network, onLine, onStation, onMemory }: Props) {
  return (
    <>
      <ProductionCard key={network.app.id} appId={network.app.id} />
      <NetworkSummary network={network} onStation={onStation} onLine={onLine} onMemory={onMemory} />
    </>
  );
}
