import { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { api } from '../lib/api.js';
import { fmtAge, fmtDate, minsSince, snippet } from '../lib/format.js';
import { Avatar, Empty, Icon } from '../ui.jsx';

const STATUS = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline', invisible: 'Offline' };

function QueueTab() {
  const app = useApp();
  const items = [...app.queue].sort((a, b) => (!!a.claimedBy - !!b.claimedBy) || a.createdAt - b.createdAt);
  const open = items.filter(i => !i.claimedBy);
  if (!items.length) {
    return <Empty icon="checks" title="All caught up" body="Nothing is waiting for a reply. Questions in support channels, DMs and mentions of staff show up here." />;
  }
  return <>
    <p className="t-caption muted">{open.length ? `${open.length} waiting · oldest ${fmtAge(minsSince(open[0].createdAt))}` : 'Everything is claimed'}</p>
    {items.map(i => {
      const ch = app.getCh(i.channelId);
      const age = minsSince(i.createdAt);
      const late = !i.claimedBy && age >= 10;
      const mine = i.claimedBy === app.me.id;
      return (
        <article key={i.messageId} className="qcard" aria-label={`Message from ${i.authorName} in ${app.labelOf(i.channelId)}`}>
          <div className="flex items-center gap-2 t-caption muted">
            <Icon name={ch?.kind === 'dm' ? 'mail' : 'hash'} size={12} />{ch?.kind === 'dm' ? 'Direct message' : ch?.name || 'Hidden channel'}
            <span className={`age t-mono ${late ? 'late' : ''}`}>{late ? <Icon name="clock" size={12} /> : null}{fmtAge(age)}</span>
          </div>
          <div className="flex items-center gap-2" style={{ '--ring': 'var(--surface)' }}>
            <Avatar src={i.authorAvatar} name={i.authorName} id={i.authorId} size={24} /><span className="t-strong truncate">{i.authorName}</span>
          </div>
          <p className="t-ui muted clamp2">{snippet(i.content, 200)}</p>
          {i.claimedBy ? (
            <div className="claimed t-caption muted">
              <Avatar src={i.claimedByAvatar} name={i.claimedByName} id={i.claimedBy} size={24} />
              <span style={{ flex: 1 }}>{mine ? "You're handling this" : `${i.claimedByName.split(' ')[0]} is handling this`}</span>
              {mine ? <button className="btn btn-ghost btn-sm" style={{ height: 28 }} onClick={() => app.claim(i, false)}>Release</button> : null}
            </div>
          ) : null}
          <div className="flex gap-2 flex-wrap">
            {!i.claimedBy ? <button className="btn btn-secondary btn-sm" onClick={() => app.claim(i)}>Claim</button> : null}
            <button className="btn btn-primary btn-sm" onClick={() => app.openQueueItem(i)} disabled={!ch}><Icon name="reply" size={14} />Reply</button>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => app.askConfirm({
              title: 'Remove this from Needs reply?',
              body: `${i.authorName}'s message stays in Discord. It just leaves the queue for every staff member.`,
              cta: 'Remove from queue', onConfirm: () => app.dismiss(i)
            })}>Dismiss</button>
          </div>
        </article>
      );
    })}
  </>;
}

function StaffTab() {
  const app = useApp();
  const { groups, members } = app.staff;
  if (!members.length) return <Empty icon="user" title="No staff found" body="Add your staff roles in Settings so the roster can find them." />;
  return groups.map(g => {
    const ids = members.filter(m => m.roleId === g.id);
    if (!ids.length) return null;
    return (
      <section key={g.id} aria-label={g.name}>
        <div className="flex items-center" style={{ padding: '0 8px 4px' }}>
          <span className="t-label" style={{ color: app.color(g.color) || 'var(--fg-muted)' }}>{g.name}</span>
          <span className="t-caption subtle" style={{ marginLeft: 'auto' }}>{ids.filter(m => m.onDuty).length} of {ids.length} on duty</span>
        </div>
        {ids.map(s => {
          const me = s.id === app.me.id;
          return (
            <div key={s.id} className="staff-row" style={{ '--ring': 'var(--bg)' }}>
              <button onClick={() => app.showDetails(s.id)} aria-label={`View ${s.name}`} style={{ borderRadius: '50%' }}>
                <Avatar src={s.avatar} name={s.name} id={s.id} size={32} status={s.status} />
              </button>
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="t-ui truncate">{s.name}{me ? <span className="subtle"> (you)</span> : null}</div>
                <div className="t-caption subtle">{STATUS[s.status] || 'Offline'}</div>
              </div>
              {me ? <button className={`pill ${s.onDuty ? 'pill-ok' : 'pill-off'}`} aria-pressed={s.onDuty} onClick={() => app.updateMe({ onDuty: !app.me.onDuty })}>{s.onDuty ? 'On duty' : 'Off duty'}</button>
                : <span className={`pill ${s.onDuty ? 'pill-ok' : 'pill-off'}`}>{s.onDuty ? 'On duty' : 'Off duty'}</span>}
              {!me ? <button className="ibtn tip tip-end" data-tip={`Ping ${s.name.split(' ')[0]}`} aria-label={`Ping ${s.name}`} onClick={() => app.insertText('@' + s.name, `<@${s.id}>`)}><Icon name="at" /></button> : null}
            </div>
          );
        })}
      </section>
    );
  });
}

function DetailsTab() {
  const app = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!app.detail) return;
    let live = true;
    setData(null); setError('');
    api(`/members/${app.detail}`).then(d => live && setData(d)).catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [app.detail]);

  if (!app.detail) return <Empty icon="user" title="No one selected" body="Select a name or avatar in the feed to see member details here." />;
  if (error) return <Empty icon="alert" title="Details didn't load" body={error} />;
  if (!data) return <div className="t-caption subtle flex items-center gap-2"><span className="spin" />Loading member…</div>;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3" style={{ '--ring': 'var(--bg)' }}>
        <Avatar src={data.avatar} name={data.name} id={data.id} size={56} status={data.inServer ? data.status : null} />
        <div className="min-w-0">
          <div className="t-title truncate">{data.name}</div>
          <div className="t-caption subtle">@{data.username}{data.bot ? ' · Bot' : data.staff ? ' · Staff' : ''}</div>
        </div>
      </div>
      <dl className="kv t-ui">
        {data.inServer ? <><dt className="subtle">Status</dt><dd>{STATUS[data.status] || 'Offline'}</dd></> : <><dt className="subtle">Server</dt><dd>Not in the server</dd></>}
        {data.staff ? <><dt className="subtle">Duty</dt><dd>{data.onDuty ? 'On duty' : 'Off duty'}</dd></> : null}
        {data.joinedAt ? <><dt className="subtle">Joined</dt><dd>{fmtDate(data.joinedAt)}</dd></> : null}
        <dt className="subtle">Account</dt><dd>Created {fmtDate(data.createdAt)}</dd>
        <dt className="subtle">User ID</dt><dd className="t-mono" style={{ overflowWrap: 'anywhere', lineHeight: '20px' }}>{data.id}</dd>
      </dl>
      {data.roles?.length ? (
        <div className="flex flex-wrap gap-1">
          {data.roles.slice(0, 12).map(r => <span key={r.id} className="chip" style={{ color: app.color(r.color) || undefined }}>{r.name}</span>)}
        </div>
      ) : null}
      {data.inServer && !data.bot && data.id !== app.me.id ? (
        <div className="flex gap-2 flex-wrap">
          {!data.staff ? <button className="btn btn-primary btn-sm" onClick={() => app.startDM(data.id)}><Icon name="mail" size={14} />Send DM</button> : null}
          <button className="btn btn-secondary btn-sm" onClick={() => app.insertText('@' + data.name, `<@${data.id}>`)}><Icon name="at" size={14} />Mention</button>
        </div>
      ) : null}
    </div>
  );
}

export default function ContextPanel() {
  const app = useApp();
  const waiting = app.queue.filter(q => !q.claimedBy).length;
  const tabs = [['queue', 'Needs reply'], ['staff', 'Staff'], ['details', 'Details']];
  function onKey(e) {
    const i = tabs.findIndex(t => t[0] === app.ctxTab);
    if (e.key === 'ArrowRight') app.setCtxTab(tabs[(i + 1) % 3][0]);
    if (e.key === 'ArrowLeft') app.setCtxTab(tabs[(i + 2) % 3][0]);
  }
  return (
    <aside className="context" aria-label="Context panel" aria-hidden={app.overlayCtx && !app.ctxOpen ? 'true' : undefined}>
      <div className="ctx-tabs" role="tablist" aria-label="Context" onKeyDown={onKey}>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" id={`tab-${k}`} className="tab t-label" aria-selected={app.ctxTab === k} aria-controls="ctx-panel"
            tabIndex={app.ctxTab === k ? 0 : -1} onClick={() => app.setCtxTab(k)}>
            {l}{k === 'queue' ? <span className={`tab-count ${waiting ? 'hot' : ''}`}>{waiting}</span> : null}
          </button>
        ))}
        {app.overlayCtx ? <button className="ibtn" style={{ marginLeft: 'auto' }} aria-label="Close panel" onClick={() => app.setCtxOpen(false)}><Icon name="x" /></button> : null}
      </div>
      <div className="ctx-body" id="ctx-panel" role="tabpanel" aria-labelledby={`tab-${app.ctxTab}`}>
        {app.ctxTab === 'queue' ? <QueueTab /> : app.ctxTab === 'staff' ? <StaffTab /> : <DetailsTab />}
      </div>
    </aside>
  );
}
