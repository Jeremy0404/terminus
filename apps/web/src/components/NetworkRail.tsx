import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';
import { Inbox } from './Inbox';
import { NetworkSummary } from './NetworkSummary';
import { ProductionCard } from './ProductionCard';

interface Props {
  readonly network: NetworkDto;
  readonly resume?: TaskSummaryDto | null;
  readonly onLine: (line: string) => void;
  readonly onStation: (line: string, task: string) => void;
  readonly onMemory: () => void;
}

export function NetworkRail({ network, resume = null, onLine, onStation, onMemory }: Props) {
  return (
    <aside className="rail">
      <Inbox network={network} lineId={null} resume={resume} onOpen={onStation} onMemory={onMemory} />
      <Deliveries key={network.app.id} network={network} onMemory={onMemory} />
      <NetworkSummary network={network} onStation={onStation} onLine={onLine} onMemory={onMemory} />
    </aside>
  );
}

function Deliveries({ network, onMemory }: { network: NetworkDto; onMemory: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <ProductionCard appId={network.app.id} detailed={expanded} appUrl={network.app.product?.appUrl ?? ''}>
      <div className="row">
        <button type="button" className="btn small subtle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'delivery.hideDetails' : 'delivery.details')}</button>
        {expanded && <button type="button" className="btn small" onClick={onMemory}>{t('delivery.configure')}</button>}
      </div>
    </ProductionCard>
  );
}
