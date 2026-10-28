import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../context.js';
import { fmtSize, fmtStamp, fmtTime, snippet } from '../lib/format.js';
import { renderContent } from '../lib/markdown.jsx';
import { Avatar, Empty, Icon, SkeletonRows, useOutside } from '../ui.jsx';
import Composer from './Composer.jsx';

const QUICK_EMOJI = ['👍', '✅', '📈', '📉', '🔥', '👀', '🙏', '⚠️'];

export function EmbedView({ e, ctx }) {
  return (
    <div className="embed" style={{ borderLeftColor: e.color || 'var(--accent-solid)' }}>
      {e.title ? <div className="t-heading">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</div> : null}
      {e.description ? <div className="t-body msg-text">{renderContent(e.description, ctx)}</div> : null}
      {e.fields?.length ? (
        <div className="embed-fields">
          {e.fields.map((f, i) => (
            <div key={i} style={f.inline === false ? { gridColumn: '1 / -1' } : null}>
              <div className="t-caption" style={{ fontWeight: 600 }}>{f.name}</div>
              <div className="t-ui muted msg-text">{renderContent(f.value, ctx)}</div>
            </div>
          ))}
        </div>
      ) : null}
      {e.image ? <img src={e.image} alt="" loading="lazy" /> : null}
      {e.footer || e.timestamp ? (
        <div className="t-caption subtle">{e.footer}{e.footer && e.timestamp ? ' · ' : ''}{e.timestamp ? fmtStamp(new Date(e.timestamp).getTime()) : ''}</div>
      ) : null}
    </div>
  );
}

function MessageRow({ msg, grouped, ch, isMention }) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  useOutside(menuRef, !!menu, () => setMenu(null));
  const fromBot = msg.author.id === app.bot.id;
  const canChange = fromBot && !msg.temp && (msg.via === app.me.id || app.me.isAdmin);
  const ctx = {
    users: { ...app.names.users, ...msg.mentions.users },
    roles: { ...app.names.roles, ...msg.mentions.roles },
    channels: { ...app.names.channels, ...msg.mentions.channels }
  };
  const viaName = msg.via ? app.staffById[msg.via]?.name || (msg.via === app.me.id ? app.me.name : 'staff') : null;
  const ref = msg.reference;
  const refName = ref ? ref.authorName || (msg.temp && app.replyTo && app.replyTo.id === ref.messageId ? app.replyTo.name : null) : null;
  const nameColor = app.color(msg.author.color) || 'var(--fg)';
  const cls = ['msg', grouped ? '' : 'first', isMention ? 'mention' : '', app.highlight === msg.id ? 'hl' : '', msg.pending || msg.failed ? 'dim' : ''].join(' ');

  async function onEditKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (await app.editMsg(ch, msg.id, e.target.value)) setEditing(false);
    }
  }

  return (
    <div className={cls} data-id={msg.id} tabIndex={-1}>
      <div>
        {grouped ? <span className="time-g t-mono">{fmtTime(msg.createdAt)}</span> : (
          <button aria-label={`View ${msg.author.name}`} onClick={() => app.showDetails(msg.author.id)} style={{ borderRadius: '50%' }}>
            <Avatar src={msg.author.avatar} name={msg.author.name} id={msg.author.id} />
          </button>
        )}
      </div>
      <div className="min-w-0">
        {ref ? (
          <div className="reply-ref t-caption">
            <Icon name="reply" size={12} />
            {refName ? <span style={{ fontWeight: 600, flexShrink: 0 }}>{refName}</span> : null}
            <span>{ref.snippet ? snippet(ref.snippet, 80) : refName ? '' : 'Original message not loaded'}</span>
          </div>
        ) : null}
        {!grouped ? (
          <div className="msg-head">
            <button className="author" style={{ color: nameColor }} onClick={() => app.showDetails(msg.author.id)}>{msg.author.name}</button>
            {msg.author.bot ? <span className="tag">BOT</span> : null}
            <span className="t-mono subtle">{fmtStamp(msg.createdAt)}</span>
            {viaName ? <span className="via" title="Only staff see this in the console">via {viaName.split(' ')[0]}</span> : null}
            {msg.editedAt ? <span className="t-caption subtle">(edited)</span> : null}
            {msg.pinned ? <span className="subtle" title="Pinned"><Icon name="pin" size={12} /></span> : null}
          </div>
        ) : null}
        {editing ? (
          <div className="grid gap-1" style={{ marginTop: 4 }}>
            <textarea className="input" id={`edit-${msg.id}`} aria-label="Edit message" defaultValue={msg.content} rows={3} autoFocus onKeyDown={onEditKey} />
            <span className="help">Enter to save · Escape to cancel</span>
          </div>
        ) : msg.content ? <div className="msg-text t-body">{renderContent(msg.content, ctx)}</div> : null}
        {msg.attachments.map((a, i) => (
          a.url && a.contentType?.startsWith('image/')
            ? <a key={a.id || i} href={a.url} target="_blank" rel="noopener noreferrer"><img className="attach-img" src={a.url} alt={a.name} loading="lazy" /></a>
            : (
              <a key={a.id || i} className="attach t-ui" href={a.url || undefined} target="_blank" rel="noopener noreferrer">
                <Icon name="file" /><span className="truncate">{a.name}</span><span className="t-mono subtle">{fmtSize(a.size)}</span>
              </a>
            )
        ))}
        {msg.embeds.map((e, i) => <EmbedView key={i} e={e} ctx={ctx} />)}
        {msg.reactions.length ? (
          <div className="reacts">
            {msg.reactions.map(r => (
              <button key={r.key} className={`react ${r.me ? 'mine' : ''}`} aria-pressed={r.me} aria-label={`${r.emoji} ${r.count}`} onClick={() => app.react(ch, msg.id, r.key)}>
                <span>{r.emoji}</span>{r.count}
              </button>
            ))}
          </div>
        ) : null}
        {msg.pending ? <div className="t-caption subtle" style={{ marginTop: 2 }}>Sending…</div> : null}
        {msg.failed ? (
          <div className="fail t-caption" role="alert">
            <Icon name="alert" size={14} /><span>{msg.failed}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => app.retryMsg(ch, msg.id)}>Retry</button>
            <button className="btn btn-ghost btn-sm" onClick={() => app.discardMsg(ch, msg.id)}>Discard</button>
          </div>
        ) : null}
      </div>
      {!msg.temp && !msg.system ? (
        <div className={`msg-actions ${menu ? 'open' : ''}`} role="toolbar" aria-label="Message actions" ref={menuRef}>
          {app.activeCh?.canPost ? <button className="ibtn tip" data-tip="Reply" aria-label="Reply" onClick={() => app.startReply(msg)}><Icon name="reply" /></button> : null}
          <button className="ibtn tip" data-tip="React" aria-label="Add reaction" aria-expanded={menu === 'react'} onClick={() => setMenu(menu === 'react' ? null : 'react')}><Icon name="smile" /></button>
          {canChange ? <>
            <button className="ibtn tip" data-tip="Edit" aria-label="Edit message" onClick={() => setEditing(true)}><Icon name="edit" /></button>
            <button className="ibtn tip" data-tip="Delete" aria-label="Delete message" onClick={() => app.askDelete(ch, msg)}><Icon name="trash" /></button>
          </> : null}
          <button className="ibtn tip" data-tip="Copy link" aria-label="Copy message link" onClick={() => app.copyLink(ch, msg.id)}><Icon name="link" /></button>
          <button className="ibtn tip tip-end" data-tip="More" aria-label="More actions" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><Icon name="more" /></button>
          {menu === 'react' ? (
            <div className="menu" style={{ top: 36, right: 0 }}>
              <div className="emoji-grid">
                {QUICK_EMOJI.map(e => <button key={e} aria-label={`React with ${e}`} onClick={() => { app.react(ch, msg.id, e); setMenu(null); }}>{e}</button>)}
              </div>
            </div>
          ) : null}
          {menu === 'more' ? (
            <div className="menu" role="menu" style={{ top: 36, right: 0 }}>
              {!msg.isDM ? <button className="menu-item" role="menuitem" onClick={() => { app.togglePin(ch, msg); setMenu(null); }}><Icon name="pin" />{msg.pinned ? 'Unpin message' : 'Pin message'}</button> : null}
              <button className="menu-item" role="menuitem" onClick={() => { app.showDetails(msg.author.id); setMenu(null); }}><Icon name="user" />View {msg.author.bot ? 'bot' : 'member'} details</button>
              {!msg.author.bot && !msg.author.staff && !msg.isDM ? <button className="menu-item" role="menuitem" onClick={() => { app.startDM(msg.author.id); setMenu(null); }}><Icon name="mail" />Send a DM</button> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ChannelView() {
  const app = useApp();
  const ch = app.activeCh;
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const feedRef = useRef(null);
  const nearBottom = useRef(true);
  const state = ch ? app.messages[ch.id] : null;
  const all = state?.list || [];
  const lastId = all[all.length - 1]?.id;

  useLayoutEffect(() => { setQ(''); setSearchOpen(false); setPinnedOnly(false); }, [ch?.id]);
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (!el || app.loading) return;
    const target = app.highlight ? el.querySelector(`[data-id="${app.highlight}"]`) : app.divider?.ch === ch?.id ? el.querySelector('.newdiv') : null;
    if (target) target.scrollIntoView({ block: 'center' }); else el.scrollTop = el.scrollHeight;
    nearBottom.current = !target;
  }, [ch?.id, app.loading, !!state]);
  useLayoutEffect(() => {
    const el = feedRef.current;
    const target = app.highlight && el?.querySelector(`[data-id="${app.highlight}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
  }, [app.highlight]);
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  if (!ch) {
    return <div className="feed"><Empty icon="hash" title="Pick a channel to start" body="Choose a channel from the sidebar, or press Ctrl K to jump to one." /></div>;
  }

  async function onScroll(e) {
    const el = e.currentTarget;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120 && state?.hasMore && !state.loadingOlder && !q && !pinnedOnly) {
      const before = el.scrollHeight;
      if (await app.loadOlder(ch.id)) requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - before; });
    }
  }

  let list = pinnedOnly ? all.filter(m => m.pinned) : all;
  if (q.trim()) {
    const fm = /^from:(\S+)\s*(.*)$/i.exec(q.trim());
    const who = fm ? fm[1].toLowerCase() : null;
    const term = (fm ? fm[2] : q).trim().toLowerCase();
    list = list.filter(m => (!who || m.author.name.toLowerCase().includes(who) || (m.via && (app.staffById[m.via]?.name || '').toLowerCase().includes(who)))
      && (!term || [m.content, ...m.embeds.map(e => `${e.title || ''} ${e.description || ''}`)].join(' ').toLowerCase().includes(term)));
  }
  const filtering = !!q.trim() || pinnedOnly;
  const pins = all.filter(m => m.pinned).length;
  const muted = app.me.muted.includes(ch.id);
  const mentionOf = m => m.author.id !== app.bot.id && (m.mentionsBot || m.mentionsStaff || m.mentionsEveryone || !!m.mentions.users[app.me.id]);

  const rows = [];
  let prev = null;
  for (const m of list) {
    const divHere = !filtering && app.divider?.ch === ch.id && app.divider.id === m.id;
    if (divHere) rows.push(<div key="newdiv" className="newdiv t-label" role="separator" aria-label={`${app.divider.count} new messages`}>New</div>);
    const grouped = !filtering && prev && prev.author.id === m.author.id && prev.via === m.via && !m.reference && m.createdAt - prev.createdAt < 5 * 60000 && !divHere;
    rows.push(<MessageRow key={m.id} msg={m} grouped={!!grouped} ch={ch.id} isMention={mentionOf(m)} />);
    prev = m;
  }

  let body;
  if (app.loading || (!state && !app.loadError)) body = <SkeletonRows />;
  else if (app.loadError && !state) body = <Empty icon="alert" title="Messages didn't load" body={app.loadError} action={{ label: 'Try again', run: () => app.openChannel(ch.id) }} />;
  else if (!all.length) body = <Empty icon={ch.kind === 'dm' ? 'mail' : 'hash'} title={ch.kind === 'dm' ? `No messages with ${ch.name} yet` : `No messages in #${ch.name} yet`} body={`Anything you send here posts as ${app.bot.name}.`} action={ch.canPost ? { label: 'Write the first message', run: app.focusComposer } : null} />;
  else if (!list.length) {
    body = <Empty icon="search" title={pinnedOnly && !q ? `No pinned messages loaded in #${ch.name}` : `No loaded messages match "${q}"`}
      body={pinnedOnly && !q ? 'Pin a message from its More menu to keep it here.' : 'Search covers the messages loaded in this view. Scroll up to load older ones, or search by author with from:name.'}
      action={{ label: pinnedOnly && !q ? 'Show all messages' : 'Clear search', run: () => { setQ(''); setPinnedOnly(false); } }} />;
  } else {
    body = <>
      {state?.loadingOlder ? <div className="feed-older t-caption subtle"><span className="spin" />Loading older messages…</div> : null}
      {!state?.hasMore && !filtering ? (
        <div className="feed-intro">
          <div className="t-heading">{ch.kind === 'dm' ? `Direct messages with ${ch.name}` : `Welcome to #${ch.name}`}</div>
          {ch.topic ? <p className="t-caption muted" style={{ marginTop: 4, maxWidth: '72ch' }}>{ch.topic}</p> : null}
        </div>
      ) : null}
      {rows}
      {state?.around ? (
        <div className="jump-latest"><button className="btn btn-secondary btn-sm" onClick={() => app.openChannel(ch.id)}>You're viewing older messages · Jump to latest</button></div>
      ) : null}
    </>;
  }

  return <>
    <header className="chanhead">
      <span className="subtle"><Icon name={ch.kind === 'dm' ? 'mail' : !ch.canPost ? 'lock' : ch.kind === 'announce' ? 'megaphone' : 'hash'} size={20} /></span>
      <h1 className="t-title truncate" style={{ flexShrink: 0, maxWidth: '45%' }}>{ch.name}</h1>
      {app.mode !== 'mobile' ? <p className="topic t-caption muted">{ch.topic}</p> : <span style={{ flex: 1 }} />}
      {searchOpen ? (
        <input className="input input-sm" id="channel-search" aria-label={`Search ${ch.name}`} placeholder="Keyword or from:name" value={q} autoFocus
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQ(''); setSearchOpen(false); } }}
          style={app.mode === 'mobile' ? { width: 140 } : null} />
      ) : null}
      <button className="ibtn tip" data-tip="Search this channel" aria-label="Search this channel" aria-pressed={searchOpen} onClick={() => { if (searchOpen) setQ(''); setSearchOpen(!searchOpen); }}><Icon name="search" size={18} /></button>
      <button className="ibtn tip" data-tip={pinnedOnly ? 'Show all messages' : 'Pinned messages'} aria-label={`Pinned messages, ${pins}`} aria-pressed={pinnedOnly} onClick={() => setPinnedOnly(!pinnedOnly)}>
        <Icon name="pin" size={18} />{pins ? <span className="count quiet">{pins}</span> : null}
      </button>
      <button className="ibtn tip tip-end" data-tip={muted ? 'Unmute channel' : 'Mute channel'} aria-label={muted ? 'Unmute channel' : 'Mute channel'} aria-pressed={muted} onClick={() => app.toggleMute(ch.id)}>
        <Icon name={muted ? 'bellOff' : 'bell'} size={18} />
      </button>
    </header>
    <div className="feed" ref={feedRef} onScroll={onScroll} role="log" aria-label={`Messages in ${ch.name}`} aria-live="polite">{body}</div>
    <Composer key={ch.id} />
  </>;
}
