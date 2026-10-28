import { useState } from 'react';
import { useApp } from '../context.js';
import { Avatar, Icon } from '../ui.jsx';

function ChannelRow({ c, compact }) {
  const app = useApp();
  const u = app.unread[c.id] || { u: 0, m: 0 };
  const active = app.view === 'channel' && app.active === c.id;
  const muted = app.me.muted.includes(c.id);
  const dm = c.kind === 'dm';
  const icon = !c.canPost ? 'lock' : c.kind === 'announce' ? 'megaphone' : 'hash';
  const label = (dm ? `Direct message with ${c.name}` : c.name) + (u.u ? `, ${u.u} unread` : '') + (u.m ? `, ${u.m} mentions` : '') + (muted ? ', muted' : '');
  return (
    <button className={`ch ${u.u ? 'unread' : ''} ${active ? 'active' : ''} ${muted ? 'muted-ch' : ''}`}
      title={compact ? (dm ? '@' : '#') + c.name : undefined} aria-current={active ? 'page' : undefined} aria-label={label}
      onClick={() => app.openChannel(c.id)}>
      <span className="ch-icon">{dm ? <Avatar src={c.avatar} name={c.name} id={c.userId} size={24} /> : <Icon name={icon} />}</span>
      <span className="ch-name">{c.name}</span>
      {u.m ? <span className="badge">{u.m > 99 ? '99+' : u.m}</span> : null}
    </button>
  );
}

export default function Rail() {
  const app = useApp();
  const compact = app.mode === 'tablet' || (app.railCollapsed && app.mode !== 'mobile');
  const [closed, setClosed] = useState({});
  const cats = [...new Set(app.channels.map(c => c.category))];
  const me = app.staffById[app.me.id];
  const navItem = (label, icon, run) => (
    <button className="ch" onClick={() => { run(); app.setRailOpen(false); }}><span className="ch-icon"><Icon name={icon} /></span><span className="ch-name">{label}</span></button>
  );
  return (
    <nav className={`rail ${compact ? 'compact' : ''}`} aria-label="Channels">
      <div className="rail-head">
        {!compact ? <>
          <span className="t-label subtle" style={{ marginRight: 'auto' }}>Channels</span>
          <button className="ibtn tip" data-tip="Mark all as read" aria-label="Mark all channels as read" onClick={app.markAllRead}><Icon name="checks" /></button>
        </> : null}
        {app.mode === 'desktop' || app.mode === 'laptop' ? (
          <button className={`ibtn tip ${compact ? 'tip-right' : ''}`} data-tip={compact ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => app.setRailCollapsed(!app.railCollapsed)}><Icon name="panel" /></button>
        ) : null}
        {app.mode === 'mobile' ? <button className="ibtn" aria-label="Close channels" onClick={() => app.setRailOpen(false)}><Icon name="x" /></button> : null}
      </div>
      <div className="rail-scroll">
        {!app.channels.length ? <p className="t-caption subtle" style={{ padding: '8px' }}>The bot can't see any text channels yet. Check its role permissions in Discord.</p> : null}
        {cats.map((cat, i) => {
          const list = app.channels.filter(c => c.category === cat);
          const shown = compact || !closed[cat] ? list : list.filter(c => app.active === c.id || app.unread[c.id]?.u);
          return (
            <section key={cat} aria-label={cat}>
              {compact ? (i ? <div className="rail-sep" /> : null) : (
                <button className="cat t-label" aria-expanded={!closed[cat]} onClick={() => setClosed({ ...closed, [cat]: !closed[cat] })}>
                  <Icon name="chevron" size={12} />{cat}
                </button>
              )}
              {shown.map(c => <ChannelRow key={c.id} c={c} compact={compact} />)}
            </section>
          );
        })}
        {app.dms.length ? (
          <section aria-label="Direct messages">
            {compact ? <div className="rail-sep" /> : <div className="cat t-label" style={{ paddingLeft: 8, cursor: 'default' }}>Direct messages</div>}
            {app.dms.map(d => <ChannelRow key={d.id} c={d} compact={compact} />)}
          </section>
        ) : null}
        {app.mode === 'mobile' ? (
          <section aria-label="Workspace">
            <div className="cat t-label" style={{ paddingLeft: 8, cursor: 'default' }}>Workspace</div>
            {navItem('Scheduled posts', 'calendar', () => app.setView('scheduled'))}
            {navItem('Templates', 'template', () => app.openBuilder({ showTemplates: true }))}
            {navItem('Audit log', 'audit', () => app.setView('audit'))}
            {app.me.isAdmin ? navItem('Settings', 'settings', () => app.setView('settings')) : null}
          </section>
        ) : null}
      </div>
      <div className="rail-user">
        <Avatar src={app.me.avatar} name={app.me.name} id={app.me.id} size={32} status={me?.status || 'online'} />
        {!compact ? (
          <div className="min-w-0" style={{ flex: 1 }}>
            <div className="t-ui truncate">{app.me.name}</div>
            <div className="t-caption subtle truncate">{app.me.role} · {app.me.onDuty ? 'On duty' : 'Off duty'}</div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
