import type { EpicDto } from '@terminus/contracts';
import { lineColor } from '../network/line-colors';

export function LineBadge({ epic }: { epic: EpicDto }) {
  return (
    <span className="line-badge" style={{ background: lineColor(epic.position) }}>
      {epic.code}
    </span>
  );
}
