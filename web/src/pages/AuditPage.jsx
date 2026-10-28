import { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { api } from '../lib/api.js';
import { fmtStamp } from '../lib/format.js';
import { Avatar, Empty, SkeletonRows } from '../ui.jsx';

const PILL = { Sent: 'pill-accent', Replied: 'pill-accent', DM: 'pill-accent', Edited: 'pill-warn', 'Schedule edited': 'pill-warn', Scheduled: 'pill-ok', 'Scheduled post sent': 'pill-ok', Deleted: 'pill-danger', 'Schedule removed': 'pill-danger', 'Scheduled post failed': 'pill-danger' };

export default function AuditPage() {
  const app = useApp();
  const [filters, setFilters] = useState({ userId: '', channelId: '', action: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);

  async function load(before) {
    const params = new URLSearchParams(Object.entries({ ...filters, before: before || '' }).filter(([, v]) => v));
    try {
      const res = await api(`/audit?${params}`);
      setData(d => ({ ...res, entries: before ? [...(d?.entries || []), ...res.entries] : res.entries }));
      setError('');
    } catch (e) {
      if (e.status === 401) app.fail(e); else setError(e.message);
    } finally {
      setMore(false);
    }
  }
  useEffect(() => { setData(null); load(); }, [filters]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const staff = app.staff.members;
  return (
    <div className="page"><div className="page-inner">
      <div className="page-head">
        <div><h1 className="t-display">Audit log</h1><p className="t-ui muted" style={{ marginTop: 4 }}>Every message staff send, edit or delete through {app.bot.name}, with who did it.</p></div>
      </div>
      <div className="field span-4">
        <label htmlFor="f-who">Staff member</label>
        <select className="input" id="f-who" value={filters.userId} onChange={e => set('userId', e.target.value)}>
          <option value="">All staff</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="field span-4">
        <label htmlFor="f-ch">Channel</label>
        <select className="input" id="f-ch" value={filters.channelId} onChange={e => set('channelId', e.target.value)}>
          <option value="">All channels</option>{[...app.channels, ...app.dms].map(c => <option key={c.id} value={c.id}>{app.labelOf(c.id)}</option>)}
        </select>
      </div>
      <div className="field span-4">
        <label htmlFor="f-act">Action</label>
        <select className="input" id="f-act" value={filters.action} onChange={e => set('action', e.target.value)}>
          <option value="">All actions</option>{(data?.actions || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error ? <div className="span-12"><Empty icon="alert" title="The audit log didn't load" body={error} action={{ label: 'Try again', run: () => load() }} /></div>
        : !data ? <div className="span-12"><SkeletonRows /></div>
        : data.entries.length ? <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Channel</th><th>Content</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {data.entries.map(r => (
                <tr key={r.id}>
                  <td className="t-mono" style={{ whiteSpace: 'nowrap' }}>{fmtStamp(r.at)}</td>
                  <td><span className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}><Avatar src={r.userAvatar} name={r.userName} id={r.userId} size={24} />{r.userName}</span></td>
                  <td><span className={`pill ${PILL[r.action] || 'pill-off'}`}>{r.action}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.channelLabel}</td>
                  <td><div className="cell-trunc muted" title={r.content}>{r.content}</div></td>
                  <td style={{ textAlign: 'right' }}>
                    {r.messageId && r.channelId && app.getCh(r.channelId) && !['Deleted', 'Dismissed'].includes(r.action)
                      ? <button className="btn btn-ghost btn-sm" onClick={() => app.openChannel(r.channelId, r.messageId)}>Jump</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {data.more ? (
            <div className="span-12" style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-secondary" disabled={more} onClick={() => { setMore(true); load(data.entries[data.entries.length - 1].id); }}>
                {more ? <span className="spin" aria-hidden="true" /> : null}Load older entries
              </button>
            </div>
          ) : null}
        </> : (
          <div className="span-12">
            <Empty icon="audit" title={Object.values(filters).some(Boolean) ? 'No entries match these filters' : 'Nothing logged yet'}
              body={Object.values(filters).some(Boolean) ? null : 'Messages staff send through the console appear here.'}
              action={Object.values(filters).some(Boolean) ? { label: 'Clear filters', run: () => setFilters({ userId: '', channelId: '', action: '' }) } : null} />
          </div>
        )}
    </div></div>
  );
}
