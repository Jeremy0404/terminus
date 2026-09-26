import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { explore, finished, stationSymbol } from '../network/exploration';
import { NetworkMap } from './NetworkMap';
import { StatusPill } from './StatusPill';

const SEARCH_SETTLE_MS = 300;

export function NetworkExplorer(props: ComponentProps<typeof NetworkMap>) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'all' | 'remaining' | 'route'>('all');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [target, setTarget] = useState('');
  const [list, setList] = useState(false);
  const [camera, setCamera] = useState(0);
  const epics = props.network.epics;
  const selectedTarget = epics.some((epic) => epic.id === target) ? target : (epics.find((epic) => props.network.tasks.some((task) => task.epicId === epic.id && !finished(task)))?.id ?? epics[0]?.id ?? '');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const visible = explore(props.network, mode, selectedTarget, term);
  return <div className="network-explorer">
    <div className="explorer-tools">
      <label className="field"><span>{t('explorer.search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('explorer.searchHint')} /></label>
      <div className="row">{(['all', 'remaining', 'route'] as const).map((value) => <button className="btn small" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`explorer.${value}`)}</button>)}</div>
      {mode === 'route' && <label className="field"><span>{t('explorer.target')}</span><select value={selectedTarget} onChange={(event) => setTarget(event.target.value)}>{epics.map((epic) => <option key={epic.id} value={epic.id}>{epic.code} · {epic.name}</option>)}</select><small>{t('explorer.routeHint')}</small></label>}
      <div className="row"><button className="btn small" aria-pressed={list} onClick={() => setList(!list)}>{t(list ? 'explorer.map' : 'explorer.list')}</button><button className="btn small" onClick={() => setCamera((n) => n + 1)}>{t('explorer.recenter')}</button><span className="muted small" role="status">{t('explorer.count', { count: visible.tasks.length })}</span></div>
    </div>
    {list ? <ul className="journey-list station-list">{visible.tasks.map((task) => <li key={task.id}><button onClick={() => props.onStation(task.epicId, task.id)}><span aria-hidden="true">{stationSymbol(task)}</span><span><b>{task.title}</b><small>{epics.find((epic) => epic.id === task.epicId)?.name}</small></span><StatusPill status={task.status} /></button></li>)}</ul>
      : <NetworkMap {...props} collapseFinished={mode !== 'route' && !term} key={`${camera}:${mode}:${selectedTarget}:${term}`} network={visible} />}
    {visible.tasks.length === 0 && <p className="muted explorer-empty">{t('explorer.empty')}</p>}
    <details className="map-legend"><summary>{t('explorer.legend')}</summary><p>{t('explorer.symbols')}</p></details>
  </div>;
}
