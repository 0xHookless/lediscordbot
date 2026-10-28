import { useRef, useState } from 'react';
import { useApp } from '../context.js';
import { Avatar, Icon, useOutside } from '../ui.jsx';

function NotifyMenu() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, open, () => setOpen(false));
  const supported = 'Notification' in window;
  const blocked = supported && Notification.permission === 'denied';
  async function toggleNotify(e) {
    const on = e.target.checked;
    if (on && supported && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return app.toast('Notifications stay off because the browser permission was not granted.');
    }
    app.setPrefs({ ...app.prefs, notify: on });
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="ibtn tip" data-tip="Notifications" aria-label="Notification settings" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={app.prefs.notify || app.prefs.sound ? 'bell' : 'bellOff'} size={20} />
      </button>
      {open ? (
        <div className="menu" style={{ top: 40, right: 0, width: 280, padding: 12 }}>
          <div className="t-label subtle" style={{ marginBottom: 4 }}>Mentions and DMs</div>
          <label className="check" htmlFor="pref-notify">
            <input type="checkbox" id="pref-notify" checked={!!app.prefs.notify} disabled={!supported || blocked} onChange={toggleNotify} />Desktop notifications
          </label>
          <label className="check" htmlFor="pref-sound">
            <input type="checkbox" id="pref-sound" checked={!!app.prefs.sound} onChange={e => app.setPrefs({ ...app.prefs, sound: e.target.checked })} />Play a sound
          </label>
          <p className="help" style={{ marginTop: 4 }}>
            {blocked ? 'Notifications are blocked for this site. Allow them in your browser settings to turn them on.' : 'Mute a channel from its header to skip it.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function TopBar() {
  const app = useApp();
  const mobile = app.mode === 'mobile';
  const waiting = app.queue.filter(q => !q.claimedBy).length;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useOutside(menuRef, menu, () => setMenu(false));
  const pageBtn = (view, icon, label) => (
    <button className="ibtn tip" data-tip={label} aria-label={label} aria-pressed={app.view === view} onClick={() => app.setView(view)}>
      <Icon name={icon} size={20} />
    </button>
  );
  return (
    <header className="topbar">
      {mobile ? <button className="ibtn" aria-label="Open channels" onClick={() => app.setRailOpen(true)}><Icon name="menu" size={20} /></button> : null}
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">{app.guild.icon ? <img src={app.guild.icon} alt="" /> : app.guild.name.slice(0, 2).toUpperCase()}</span>
        <span className="t-heading">{app.guild.name}</span>
      </div>
      {!mobile ? (
        <button className="search-trigger" onClick={() => app.setPalette(true)} aria-label="Search channels, members and actions (Ctrl K)">
          <Icon name="search" /><span>Search channels, members, actions</span><kbd>Ctrl K</kbd>
        </button>
      ) : null}
      <div className="flex items-center gap-1" style={{ marginLeft: 'auto' }}>
        {mobile ? <button className="ibtn" aria-label="Search" onClick={() => app.setPalette(true)}><Icon name="search" size={20} /></button> : <>
          {pageBtn('scheduled', 'calendar', 'Scheduled posts')}
          <button className="ibtn tip" data-tip="Templates" aria-label="Templates" onClick={() => app.openBuilder({ showTemplates: true })}><Icon name="template" size={20} /></button>
          {pageBtn('audit', 'audit', 'Audit log')}
          {app.me.isAdmin ? pageBtn('settings', 'settings', 'Settings') : null}
          <NotifyMenu />
          <button className="ibtn tip" data-tip={app.effTheme === 'dark' ? 'Light theme' : 'Dark theme'} aria-label="Toggle theme" onClick={app.toggleTheme}>
            <Icon name={app.effTheme === 'dark' ? 'sun' : 'moon'} size={20} />
          </button>
        </>}
        {app.overlayCtx ? (
          <button className="ibtn tip tip-end" data-tip="Needs reply" aria-label={`Needs reply, ${waiting} waiting`} aria-pressed={app.ctxOpen}
            onClick={() => { app.setCtxTab('queue'); app.setCtxOpen(!app.ctxOpen); }}>
            <Icon name="inbox" size={20} />{waiting ? <span className="count">{waiting}</span> : null}
          </button>
        ) : null}
        {!mobile ? (
          <span className="conn t-caption" role="status">
            <span className={`dot ${app.conn && app.conn !== 'back' ? 'down' : ''}`} />{app.conn && app.conn !== 'back' ? 'Reconnecting' : 'Live'}
          </span>
        ) : null}
        <div className="me" ref={menuRef} style={{ position: 'relative' }}>
          {!mobile ? <>
            <span className="t-ui muted" id="duty-label">On duty</span>
            <button className="switch" role="switch" aria-checked={app.me.onDuty} aria-labelledby="duty-label" onClick={() => app.updateMe({ onDuty: !app.me.onDuty })} />
          </> : null}
          <button aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(!menu)} style={{ borderRadius: '50%', '--ring': 'var(--bg)' }}>
            <Avatar src={app.me.avatar} name={app.me.name} id={app.me.id} size={32} status={app.staffById[app.me.id]?.status || 'online'} />
          </button>
          {menu ? (
            <div className="menu" role="menu" style={{ top: 44, right: 0 }}>
              <div style={{ padding: '8px 8px 4px' }}><div className="t-ui">{app.me.name}</div><div className="t-caption subtle">{app.me.role}{app.me.isAdmin ? ' · Admin' : ''}</div></div>
              {mobile ? <>
                <button className="menu-item" role="menuitem" onClick={() => { app.updateMe({ onDuty: !app.me.onDuty }); setMenu(false); }}><Icon name="bolt" />{app.me.onDuty ? 'Go off duty' : 'Go on duty'}</button>
                <button className="menu-item" role="menuitem" onClick={() => { app.toggleTheme(); setMenu(false); }}><Icon name={app.effTheme === 'dark' ? 'sun' : 'moon'} />{app.effTheme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
              </> : null}
              <button className="menu-item" role="menuitem" onClick={app.signOut}><Icon name="logout" />Sign out</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
