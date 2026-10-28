import { useApp } from '../context.js';
import { fmtUTC, snippet } from '../lib/format.js';
import { Avatar, Empty, Icon } from '../ui.jsx';

const STATUS_PILL = { pending: ['pill-accent', 'Scheduled'], sent: ['pill-ok', 'Sent'], failed: ['pill-danger', 'Failed'] };

export default function ScheduledPage() {
  const app = useApp();
  const list = [...app.scheduled].sort((a, b) => a.runAt - b.runAt);
  const describe = s => (s.payload.embed ? s.payload.embed.title || snippet(s.payload.embed.description) : snippet(s.payload.content));
  const canChange = s => s.status !== 'sent' && (app.me.isAdmin || s.createdBy === app.me.id);
  return (
    <div className="page"><div className="page-inner">
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="t-display">Scheduled posts</h1>
          <p className="t-ui muted" style={{ marginTop: 4 }}>These go out from {app.bot.name} at the time shown, in server time (UTC).</p>
        </div>
        <button className="btn btn-primary" onClick={() => app.openBuilder({ schedule: true })}><Icon name="plus" />Schedule a post</button>
      </div>
      {list.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Posts at</th><th>Channel</th><th>Post</th><th>Scheduled by</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id}>
                <td className="t-mono" style={{ whiteSpace: 'nowrap' }}>{fmtUTC(s.runAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{app.labelOf(s.channelId)}</td>
                <td>
                  <div className="cell-trunc">{describe(s)}{/@(everyone|here)/.test(s.payload.content) ? <> <span className="pill pill-warn">{s.payload.content.match(/@(everyone|here)/)[0]}</span></> : null}</div>
                  {s.status === 'failed' ? <div className="err" style={{ marginTop: 2 }}>{s.error}</div> : null}
                </td>
                <td><span className="flex items-center gap-2" style={{ whiteSpace: 'nowrap' }}><Avatar src={s.createdByAvatar} name={s.createdByName} id={s.createdBy} size={24} />{s.createdByName}</span></td>
                <td><span className={`pill ${STATUS_PILL[s.status][0]}`}>{STATUS_PILL[s.status][1]}</span></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {s.status === 'sent' && s.messageId ? <button className="btn btn-ghost btn-sm" onClick={() => app.openChannel(s.channelId, s.messageId)}>View</button> : null}
                  {canChange(s) ? <>
                    <button className="btn btn-ghost btn-sm" onClick={() => app.openBuilder({ schedule: true, edit: s })}>{s.status === 'failed' ? 'Fix and reschedule' : 'Edit'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => app.askConfirm({
                      title: 'Remove this scheduled post?', body: `"${describe(s)}" will not be posted to ${app.labelOf(s.channelId)}.`,
                      cta: 'Remove post', danger: true, onConfirm: () => app.unschedule(s)
                    })}>Remove</button>
                  </> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <div className="span-12">
          <Empty icon="calendar" title="Nothing scheduled" body="Schedule market-open briefings or maintenance notices ahead of time and they post on their own."
            action={{ label: 'Schedule a post', run: () => app.openBuilder({ schedule: true }) }} />
        </div>
      )}
    </div></div>
  );
}
