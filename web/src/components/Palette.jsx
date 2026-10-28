import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.js';
import { api } from '../lib/api.js';
import { Avatar, Empty, Icon, useOverlay } from '../ui.jsx';

export default function Palette() {
  const app = useApp();
  const ref = useRef(null);
  const listRef = useRef(null);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [people, setPeople] = useState([]);
  const close = () => app.setPalette(false);
  useOverlay(ref, close);

  const ql = q.trim().toLowerCase();
  useEffect(() => {
    if (ql.length < 2) { setPeople([]); return; }
    const t = setTimeout(() => api(`/members?q=${encodeURIComponent(ql)}`).then(setPeople).catch(() => setPeople([])), 150);
    return () => clearTimeout(t);
  }, [ql]);

  const items = [
    ...app.channels.map(c => ({ group: 'Channels', icon: !c.canPost ? 'lock' : c.kind === 'announce' ? 'megaphone' : 'hash', label: c.name, hint: c.category, run: () => app.openChannel(c.id) })),
    ...app.dms.map(d => ({ group: 'Channels', person: { id: d.userId, name: d.name, avatar: d.avatar }, label: d.name, hint: 'Direct message', run: () => app.openChannel(d.id) })),
    ...(ql.length >= 2 ? people : app.staff.members).map(p => ({ group: 'Members', person: p, label: p.name, hint: p.staff === false ? 'Member' : 'Staff', run: () => app.showDetails(p.id) })),
    { group: 'Actions', icon: 'embed', label: 'New embed announcement', run: () => app.openBuilder({}) },
    { group: 'Actions', icon: 'calendar', label: 'Schedule a post', run: () => app.openBuilder({ schedule: true }) },
    { group: 'Actions', icon: 'calendar', label: 'Open scheduled posts', run: () => app.setView('scheduled') },
    { group: 'Actions', icon: 'audit', label: 'Open audit log', run: () => app.setView('audit') },
    ...(app.me.isAdmin ? [{ group: 'Actions', icon: 'settings', label: 'Open settings', run: () => app.setView('settings') }] : []),
    { group: 'Actions', icon: 'checks', label: 'Mark all channels as read', run: app.markAllRead },
    { group: 'Actions', icon: 'bolt', label: app.me.onDuty ? 'Go off duty' : 'Go on duty', run: () => app.updateMe({ onDuty: !app.me.onDuty }) },
    { group: 'Actions', icon: app.effTheme === 'dark' ? 'sun' : 'moon', label: `Switch to ${app.effTheme === 'dark' ? 'light' : 'dark'} theme`, run: app.toggleTheme },
    { group: 'Actions', icon: 'logout', label: 'Sign out', run: app.signOut }
  ];
  // Member search results already match on the server, so they skip the local filter.
  const list = items.filter(x => !ql || (x.group === 'Members' && ql.length >= 2) || `${x.label} ${x.hint || ''}`.toLowerCase().includes(ql)).slice(0, 40);
  const sel = Math.min(i, Math.max(0, list.length - 1));
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel, ql]);

  function run(x) { close(); x.run(); }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((sel + 1) % Math.max(1, list.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((sel - 1 + list.length) % Math.max(1, list.length)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); run(list[sel]); }
  }

  let lastGroup = null;
  return <>
    <div className="scrim" onClick={close} />
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" ref={ref}>
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input data-autofocus id="palette-q" aria-label="Search channels, members and actions" placeholder="Jump to a channel, member or action"
          value={q} onChange={e => { setQ(e.target.value); setI(0); }} onKeyDown={onKey}
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={list[sel] ? `pi-${sel}` : undefined} />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {list.length ? list.map((x, idx) => {
          const head = x.group !== lastGroup ? <div key={'g' + x.group} className="palette-group t-label subtle">{x.group}</div> : null;
          lastGroup = x.group;
          return [head, (
            <button key={x.group + x.label + idx} id={`pi-${idx}`} role="option" tabIndex={-1} aria-selected={idx === sel}
              className={`palette-item t-ui ${idx === sel ? 'on' : ''}`} onMouseMove={() => idx !== sel && setI(idx)} onClick={() => run(x)}>
              {x.person ? <Avatar src={x.person.avatar} name={x.person.name} id={x.person.id} size={24} />
                : <span className="subtle" style={{ width: 24, display: 'grid', placeItems: 'center' }}><Icon name={x.icon} /></span>}
              <span className="truncate">{x.label}</span>{x.hint ? <span className="hint t-caption">{x.hint}</span> : null}
            </button>
          )];
        }) : <Empty icon="search" title={`No matches for "${q}"`} body="Try a channel name, a member, or an action like schedule." />}
      </div>
      <div className="palette-foot t-caption"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Alt</kbd>+<kbd>↓</kbd> next unread channel</span></div>
    </div>
  </>;
}
