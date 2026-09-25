import { useTranslation } from 'react-i18next';
import { pinnedLines, type ViewBox } from '../../network/camera';
import { ROUNDEL_RADIUS, type NetworkLayout } from '../../network/layout';
import { lineColor } from '../../network/line-colors';
import type { Level } from '../../state/location';
import { LineRoundel } from './MapDrawing';

const PIN_GAP = 8;

interface Props {
  readonly layout: NetworkLayout;
  readonly view: ViewBox;
  readonly level: Level;
  readonly openLine: string | null;
  readonly onLine: (epicId: string) => void;
}

export function PinnedRoundels({ layout, view, level, openLine, onLine }: Props) {
  const { t } = useTranslation();
  const x = view[0] + ROUNDEL_RADIUS + PIN_GAP;
  return (
    <>
      {pinnedLines(layout, view).map((line) => {
        const dim = level !== 'network' && openLine !== line.epic.id;
        return (
          <g key={line.epic.id} className={`pinned-roundel ${dim ? 'dim' : ''}`} style={{ color: lineColor(line.epic.position) }}
            role="button" tabIndex={0} aria-label={t('map.line', { name: line.epic.name })} onClick={() => onLine(line.epic.id)}
            onKeyDown={(event) => event.key === 'Enter' && onLine(line.epic.id)}>
            <LineRoundel x={x} y={line.y} code={line.epic.code} />
          </g>
        );
      })}
    </>
  );
}
