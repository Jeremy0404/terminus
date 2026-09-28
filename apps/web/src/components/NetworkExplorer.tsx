import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { explore, stationSymbol } from '../network/exploration';
import { levelOf } from '../state/location';
import { NetworkMap } from './NetworkMap';
import { StatusPill } from './StatusPill';

const SEARCH_SETTLE_MS = 300;

export function NetworkExplorer(props: ComponentProps<typeof NetworkMap>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [list, setList] = useState(false);
  const epics = props.network.epics;
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const station = levelOf(props.place) === 'platform';
  const visible = explore(props.network, term);
  return <div className="network-explorer">
    {!station && <div className="explorer-tools">
      <label className="field"><span>{t('explorer.search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('explorer.searchHint')} /></label>
      <div className="row"><button className="btn small" aria-pressed={list} onClick={() => setList(!list)}>{t(list ? 'explorer.map' : 'explorer.list')}</button><span className="muted small" role="status">{t('explorer.count', { count: visible.tasks.length })}</span></div>
    </div>}
    {list && !station ? <ul className="journey-list station-list">{visible.tasks.map((task) => <li key={task.id}><button onClick={() => props.onStation(task.epicId, task.id)}><span aria-hidden="true">{stationSymbol(task)}</span><span><b>{task.title}</b><small>{epics.find((epic) => epic.id === task.epicId)?.name}</small></span><StatusPill status={task.status} /></button></li>)}</ul>
      : <NetworkMap {...props} collapseFinished={!term} key={term} network={station ? props.network : visible} />}
    {!station && visible.tasks.length === 0 && <p className="muted explorer-empty">{t('explorer.empty')}</p>}
    {!station && <details className="map-legend"><summary>{t('explorer.legend')}</summary><p>{t('explorer.symbols')}</p></details>}
  </div>;
}
