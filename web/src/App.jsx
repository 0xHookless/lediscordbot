import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, store } from './lib/api.js';
import { readable } from './lib/color.js';
import { chLabel, snippet, uid } from './lib/format.js';
import { AppCtx } from './context.js';
import { Icon, useMode } from './ui.jsx';
import TopBar from './components/TopBar.jsx';
import Rail from './components/Rail.jsx';
import ChannelView from './components/ChannelView.jsx';
import ContextPanel from './components/ContextPanel.jsx';
import Palette from './components/Palette.jsx';
import EmbedBuilder from './components/EmbedBuilder.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import ScheduledPage from './pages/ScheduledPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  const [boot, setBoot] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');

  async function load(silent = false) {
    try {
      setBoot(await api('/bootstrap'));
      setState('ready');
    } catch (e) {
      if (e.status === 401) setState('signed-out');
      else if (!silent) { setError(e.message); setState('error'); }
    }
  }
  useEffect(() => { load(); }, []);

  if (state === 'signed-out') return <SignIn />;
  if (state === 'error') {
    return (
      <div className="center-screen"><div className="signin" role="alert">
        <h1 className="t-title">The console couldn't load</h1>
        <p className="t-body muted">{error}</p>
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => { setState('loading'); load(); }}>Try again</button>
      </div></div>
    );
  }
  if (!boot) return <div className="center-screen"><span className="t-ui muted flex items-center gap-2"><span className="spin" />Loading the console…</span></div>;
  return <Console boot={boot} reload={() => load(true)} onSignedOut={() => setState('signed-out')} />;
}

function SignIn() {
  return (
    <div className="center-screen"><main className="signin">
      <span className="brand-mark" aria-hidden="true">SC</span>
      <h1 className="t-title">Staff Console</h1>
      <p className="t-body muted">Sign in with your Discord account. Only members with a staff role can get in.</p>
      <a className="btn btn-primary" style={{ justifySelf: 'start' }} href="/auth/login">Sign in with Discord</a>
    </main></div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* audio unavailable */ }
}

function Console({ boot, reload, onSignedOut }) {
  const mode = useMode();
  const overlayCtx = mode !== 'desktop';
  const [theme, setTheme] = useState(() => store.get('theme'));
  const [me, setMe] = useState(boot.me);
  const [channels, setChannels] = useState(boot.channels);
  const [dms, setDms] = useState(boot.dms);
  const [roles, setRoles] = useState(boot.roles);
  const [settings, setSettings] = useState(boot.settings);
  const [queue, setQueue] = useState(boot.queue);
  const [staff, setStaff] = useState(boot.staff);
  const [templates, setTemplates] = useState(boot.templates);
  const [scheduled, setScheduled] = useState(boot.scheduled);
  const [unread, setUnread] = useState(boot.unread);
  useEffect(() => {
    setMe(boot.me); setChannels(boot.channels); setDms(boot.dms); setRoles(boot.roles); setSettings(boot.settings);
    setQueue(boot.queue); setStaff(boot.staff); setTemplates(boot.templates); setScheduled(boot.scheduled); setUnread(boot.unread);
  }, [boot]);

  const allChannels = useMemo(() => [...channels, ...dms], [channels, dms]);
  const getCh = id => allChannels.find(c => c.id === id) || null;
  const labelOf = id => chLabel(getCh(id));

  const [view, setViewRaw] = useState('channel');
  const [active, setActive] = useState(() => {
    const saved = store.get('active');
    return allChannels.some(c => c.id === saved) ? saved : boot.channels[0]?.id || boot.dms[0]?.id || null;
  });
  const [messages, setMessages] = useState({});
  const [divider, setDivider] = useState(() => {
    const u = boot.unread[active];
    return u?.u ? { ch: active, id: u.first, count: u.u } : null;
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [ctxTab, setCtxTab] = useState('queue');
  const [detail, setDetail] = useState(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(() => store.get('railCollapsed', false));
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [palette, setPalette] = useState(false);
  const [builder, setBuilder] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [sockUp, setSockUp] = useState(true);
  const [botUp, setBotUp] = useState(boot.status === 'live');
  const [back, setBack] = useState(false);
  const [prefs, setPrefsRaw] = useState(() => store.get('prefs', { notify: false, sound: false }));
  const [, setTick] = useState(0);

  const composerRef = useRef(null);
  const picksRef = useRef({});
  const drafts = useRef({});
  const loadSeq = useRef(0);
  const readTimers = useRef({});
  const live = useRef({});
  live.current = { active, view, messages, me, unread, prefs, allChannels };

  const effTheme = theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }, [theme]);

  const staffById = useMemo(() => Object.fromEntries(staff.members.map(m => [m.id, m])), [staff]);
  const names = useMemo(() => ({
    users: Object.fromEntries([...staff.members.map(m => [m.id, m.name]), ...dms.map(d => [d.userId, d.name]), [boot.bot.id, boot.bot.name]]),
    roles: Object.fromEntries(roles.map(r => [r.id, r.name])),
    channels: Object.fromEntries(channels.map(c => [c.id, c.name]))
  }), [staff, dms, roles, channels, boot.bot]);

  /* ---------- Feedback ---------- */
  function toast(text, action, kind) {
    const id = uid('t');
    setToasts(t => [...t.slice(-2), { id, text, action, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 4000);
  }
  function fail(e) {
    if (e.status === 401) return onSignedOut();
    toast(e.message, null, 'error');
  }
  const setView = v => { setViewRaw(v); if (mode === 'mobile') setRailOpen(false); };
  const focusComposer = () => setTimeout(() => composerRef.current?.focus(), 0);
  const setPrefs = p => { setPrefsRaw(p); store.set('prefs', p); };

  /* ---------- Messages ---------- */
  function patchList(ch, fn) {
    setMessages(p => (p[ch] ? { ...p, [ch]: { ...p[ch], list: fn(p[ch].list) } } : p));
  }

  async function loadMessages(id, around) {
    const seq = ++loadSeq.current;
    setLoadError('');
    const timer = setTimeout(() => seq === loadSeq.current && setLoading(true), 120);
    try {
      const list = await api(`/channels/${id}/messages${around ? '?around=' + around : ''}`);
      if (seq !== loadSeq.current) return null;
      setMessages(p => ({ ...p, [id]: { list, hasMore: list.length >= 50, around: !!around } }));
      return list;
    } catch (e) {
      if (seq === loadSeq.current) { if (e.status === 401) onSignedOut(); else setLoadError(e.message); }
      return null;
    } finally {
      clearTimeout(timer);
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  function markRead(id, list) {
    const last = [...(list || [])].reverse().find(m => !m.temp);
    setUnread(p => { if (!p[id]) return p; const n = { ...p }; delete n[id]; return n; });
    if (!last) return;
    clearTimeout(readTimers.current[id]);
    readTimers.current[id] = setTimeout(() => api(`/channels/${id}/read`, { method: 'POST', body: { messageId: last.id } }).catch(() => {}), 600);
  }

  async function openChannel(id, hl) {
    if (!id) return;
    const L = live.current;
    drafts.current[L.active] = draft;
    setViewRaw('channel');
    setReplyTo(null);
    if (mode === 'mobile') setRailOpen(false);
    store.set('active', id);
    const same = id === L.active && L.view === 'channel';
    if (!same) {
      const u = L.unread[id];
      setDivider(u?.u ? { ch: id, id: u.first, count: u.u } : null);
      setActive(id);
      setDraft(drafts.current[id] || '');
      picksRef.current = {};
    }
    const cached = L.messages[id];
    let list = cached?.list;
    const needAround = hl && !(list || []).some(m => m.id === hl);
    if (!list || needAround || (!same && cached?.around)) list = await loadMessages(id, needAround ? hl : null);
    if (list) markRead(id, list);
    if (hl) { setHighlight(hl); setTimeout(() => setHighlight(null), 2200); }
  }

  async function loadOlder(id) {
    const cur = live.current.messages[id];
    const oldest = cur?.list.find(m => !m.temp);
    if (!cur?.hasMore || cur.loadingOlder || !oldest) return false;
    setMessages(p => ({ ...p, [id]: { ...p[id], loadingOlder: true } }));
    try {
      const older = await api(`/channels/${id}/messages?before=${oldest.id}`);
      setMessages(p => ({ ...p, [id]: { ...p[id], list: [...older, ...p[id].list], hasMore: older.length >= 50, loadingOlder: false } }));
      return true;
    } catch (e) {
      setMessages(p => ({ ...p, [id]: { ...p[id], loadingOlder: false } }));
      fail(e);
      return false;
    }
  }

  async function doSend(temp) {
    const r = temp._req;
    const form = new FormData();
    form.append('payload', JSON.stringify({ content: r.content, replyTo: r.replyTo, ping: r.ping, embed: r.embed, crosspost: r.crosspost, signature: r.signature }));
    r.files.forEach(f => form.append('files', f));
    try {
      const { message, cleared } = await api(`/channels/${r.channelId}/messages`, { method: 'POST', form });
      patchList(r.channelId, list => {
        const rest = list.filter(m => m.id !== temp.id);
        return rest.some(m => m.id === message.id) ? rest : [...rest, message];
      });
      toast(`Posted to ${labelOf(r.channelId)}${r.crosspost ? ' and published to followers' : ''}${cleared ? ' · cleared from Needs reply' : ''}`,
        { label: 'Undo', run: () => deleteMsg(r.channelId, message.id) });
      return true;
    } catch (e) {
      if (e.status === 401) { onSignedOut(); return false; }
      patchList(r.channelId, list => list.map(m => (m.id === temp.id ? { ...m, pending: false, failed: e.message } : m)));
      if (!live.current.messages[r.channelId]) toast(e.message, null, 'error');
      return false;
    }
  }

  function send({ channelId = active, content = '', files = [], replyTo: replyId = null, ping = true, embed = null, crosspost = false, signature = false }) {
    const temp = {
      id: uid('temp-'), temp: true, pending: true, channelId, createdAt: Date.now(),
      author: { id: boot.bot.id, name: boot.bot.name, avatar: boot.bot.avatar, bot: true },
      via: me.id,
      content: [content, signature && content ? me.signatureText : ''].filter(Boolean).join('\n'),
      attachments: files.map(f => ({ name: f.name, size: f.size })),
      embeds: embed ? [{ ...embed, timestamp: embed.timestamp ? new Date().toISOString() : null }] : [],
      reactions: [], reference: replyId ? { messageId: replyId } : null,
      mentions: { users: {}, roles: {}, channels: {} },
      _req: { channelId, content, files, replyTo: replyId, ping, embed, crosspost, signature }
    };
    patchList(channelId, list => [...list, temp]);
    return doSend(temp);
  }

  function retryMsg(ch, id) {
    const msg = live.current.messages[ch]?.list.find(m => m.id === id);
    if (!msg) return;
    patchList(ch, list => list.map(m => (m.id === id ? { ...m, pending: true, failed: null } : m)));
    doSend(msg);
  }
  const discardMsg = (ch, id) => patchList(ch, list => list.filter(m => m.id !== id));

  async function deleteMsg(ch, id) {
    try {
      await api(`/channels/${ch}/messages/${id}`, { method: 'DELETE' });
      patchList(ch, list => list.filter(m => m.id !== id));
      toast(`Message deleted from ${labelOf(ch)}`);
    } catch (e) { fail(e); }
  }
  function askDelete(ch, msg) {
    setConfirm({
      title: `Delete this message from ${labelOf(ch)}?`,
      body: 'It is removed from Discord for everyone. The audit log keeps a copy.',
      cta: 'Delete message', danger: true, onConfirm: () => deleteMsg(ch, msg.id)
    });
  }
  async function editMsg(ch, id, content) {
    try {
      const { message } = await api(`/channels/${ch}/messages/${id}`, { method: 'PATCH', body: { content } });
      patchList(ch, list => list.map(m => (m.id === id ? message : m)));
      toast(`Message updated in ${labelOf(ch)}`);
      return true;
    } catch (e) { fail(e); return false; }
  }
  async function react(ch, id, emoji) {
    try {
      const { message } = await api(`/channels/${ch}/messages/${id}/reactions`, { method: 'POST', body: { emoji } });
      patchList(ch, list => list.map(m => (m.id === id ? message : m)));
    } catch (e) { fail(e); }
  }
  async function togglePin(ch, msg) {
    try {
      const { message } = await api(`/channels/${ch}/messages/${msg.id}/pin`, { method: 'POST', body: { pinned: !msg.pinned } });
      patchList(ch, list => list.map(m => (m.id === msg.id ? message : m)));
      toast(message.pinned ? `Pinned in ${labelOf(ch)}` : 'Unpinned');
    } catch (e) { fail(e); }
  }
  function copyLink(ch, id) {
    const c = getCh(ch);
    const url = `https://discord.com/channels/${c?.kind === 'dm' ? '@me' : boot.guild.id}/${ch}/${id}`;
    navigator.clipboard?.writeText(url).then(() => toast('Message link copied'), () => toast('Copy was blocked. Link: ' + url));
  }

  /* ---------- Queue, people and preferences ---------- */
  async function claim(item, value = true) {
    try {
      await api(`/queue/${item.messageId}/claim`, { method: 'POST', body: { claim: value } });
      if (value) toast("Claimed. Other staff now see you're handling it.");
    } catch (e) { fail(e); }
  }
  async function dismiss(item) {
    try {
      await api(`/queue/${item.messageId}/dismiss`, { method: 'POST' });
      toast('Removed from Needs reply');
    } catch (e) { fail(e); }
  }
  async function openQueueItem(item) {
    if (!item.claimedBy) claim(item);
    if (overlayCtx) setCtxOpen(false);
    await openChannel(item.channelId, item.messageId);
    setReplyTo({ id: item.messageId, ping: true, name: item.authorName });
    focusComposer();
  }
  function startReply(msg) {
    setReplyTo({ id: msg.id, ping: !msg.author.bot, name: msg.author.name, color: msg.author.color });
    focusComposer();
  }
  function insertText(display, token) {
    if (token) picksRef.current[display] = token;
    if (live.current.view !== 'channel') setViewRaw('channel');
    if (overlayCtx) setCtxOpen(false);
    setDraft(d => (d && !/\s$/.test(d) ? d + ' ' : d) + display + ' ');
    focusComposer();
  }
  function showDetails(id) {
    setDetail(id);
    setCtxTab('details');
    if (overlayCtx) setCtxOpen(true);
  }
  async function startDM(userId) {
    try {
      const { dm } = await api('/dms', { method: 'POST', body: { userId } });
      setDms(d => (d.some(x => x.id === dm.id) ? d : [dm, ...d]));
      if (overlayCtx) setCtxOpen(false);
      await openChannel(dm.id);
      focusComposer();
    } catch (e) { fail(e); }
  }
  async function updateMe(patch) {
    try {
      const { me: next } = await api('/me', { method: 'PATCH', body: patch });
      setMe(next);
    } catch (e) { fail(e); }
  }
  const toggleMute = id => updateMe({ muted: me.muted.includes(id) ? me.muted.filter(x => x !== id) : [...me.muted, id] });
  async function markAllRead() {
    try {
      await api('/read-all', { method: 'POST' });
      setUnread({});
      toast('Marked all channels as read');
    } catch (e) { fail(e); }
  }
  function toggleTheme() {
    const next = effTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    store.set('theme', next);
  }
  async function signOut() {
    await fetch('/auth/logout', { method: 'POST', headers: { 'X-Console': '1' } }).catch(() => {});
    onSignedOut();
  }

  /* ---------- Announcements ---------- */
  async function schedule(body, id) {
    try {
      const res = await api(id ? `/scheduled/${id}` : '/scheduled', { method: id ? 'PATCH' : 'POST', body });
      setScheduled(res.scheduled);
      setBuilder(null);
      toast(id ? 'Scheduled post updated' : `Scheduled for #${getCh(body.channelId)?.name}`, id ? null : { label: 'View', run: () => setView('scheduled') });
    } catch (e) { fail(e); }
  }
  async function unschedule(item) {
    try {
      const res = await api(`/scheduled/${item.id}`, { method: 'DELETE' });
      setScheduled(res.scheduled);
      toast('Removed from schedule');
    } catch (e) { fail(e); }
  }
  async function saveTemplate(name, embed) {
    try {
      const res = await api('/templates', { method: 'POST', body: { name, embed } });
      setTemplates(res.templates);
      toast(`Saved "${name}" to templates`);
    } catch (e) { fail(e); }
  }
  async function saveSettings(next) {
    try {
      const res = await api('/settings', { method: 'PUT', body: next });
      setSettings(s => ({ ...s, ...res.settings }));
      toast('Settings saved');
      reload();
      return true;
    } catch (e) { fail(e); return false; }
  }

  /* ---------- Live updates ---------- */
  function isMention(m) {
    const L = live.current;
    return m.isDM || m.mentionsBot || m.mentionsStaff || m.mentionsEveryone || !!m.mentions.users[L.me.id];
  }
  function notify(m) {
    const L = live.current;
    if (L.prefs.sound) beep();
    if (!L.prefs.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(`${m.author.name} in ${chLabel(L.allChannels.find(c => c.id === m.channelId))}`, {
      body: snippet(m.content || m.embeds[0]?.title || 'Sent an attachment', 140), icon: m.author.avatar, tag: m.id
    });
    n.onclick = () => { window.focus(); openChannelRef.current(m.channelId, m.id); n.close(); };
  }
  const openChannelRef = useRef(openChannel);
  openChannelRef.current = openChannel;

  const handlers = useRef({});
  handlers.current = {
    create(message) {
      const ch = message.channelId;
      setMessages(p => {
        const cur = p[ch];
        if (!cur || cur.around || cur.list.some(m => m.id === message.id)) return p;
        return { ...p, [ch]: { ...cur, list: [...cur.list, message] } };
      });
      if (message.author.id === boot.bot.id) return;
      const L = live.current;
      const viewing = L.active === ch && L.view === 'channel' && !document.hidden;
      const mention = isMention(message);
      if (viewing) markRead(ch, [message]);
      else {
        setUnread(p => {
          const u = p[ch] || { u: 0, m: 0, first: null };
          return { ...p, [ch]: { u: u.u + 1, m: u.m + (mention ? 1 : 0), first: u.first || message.id } };
        });
      }
      if (mention && !viewing && !L.me.muted.includes(ch)) notify(message);
    },
    update(message) {
      patchList(message.channelId, list => list.map(m => (m.id === message.id ? message : m)));
    },
    remove({ channelId, id }) {
      patchList(channelId, list => list.filter(m => m.id !== id));
    }
  };

  useEffect(() => {
    const socket = io({ withCredentials: true });
    let wasDown = false;
    socket.on('connect', () => {
      setSockUp(true);
      if (wasDown) {
        wasDown = false;
        setBack(true);
        setTimeout(() => setBack(false), 2500);
        reload();
        const id = live.current.active;
        if (id) loadMessages(id).then(list => list && live.current.active === id && markRead(id, list));
      }
    });
    socket.on('disconnect', () => { wasDown = true; setSockUp(false); });
    socket.on('connect_error', e => {
      if (e.message === 'unauthorized') onSignedOut();
      else { wasDown = true; setSockUp(false); }
    });
    socket.on('conn', ({ status }) => setBotUp(status === 'live'));
    socket.on('message:create', ({ message }) => handlers.current.create(message));
    socket.on('message:update', ({ message }) => handlers.current.update(message));
    socket.on('message:delete', data => handlers.current.remove(data));
    socket.on('queue:update', ({ queue: q }) => setQueue(q));
    socket.on('staff:update', ({ staff: s }) => setStaff(s));
    socket.on('dms:update', ({ dms: d }) => setDms(d));
    socket.on('scheduled:update', ({ scheduled: s }) => setScheduled(s));
    socket.on('templates:update', ({ templates: t }) => setTemplates(t));
    socket.on('settings:update', () => reload());
    return () => socket.disconnect();
  }, []);

  useEffect(() => { openChannel(active); }, []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (mode === 'desktop') setCtxOpen(false); if (mode !== 'mobile') setRailOpen(false); }, [mode]);
  useEffect(() => {
    const onVisible = () => {
      const L = live.current;
      if (!document.hidden && L.view === 'channel' && L.unread[L.active]) markRead(L.active, L.messages[L.active]?.list);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const totalUnread = Object.values(unread).reduce((n, u) => n + (u?.u || 0), 0);
  useEffect(() => { document.title = (totalUnread ? `(${totalUnread}) ` : '') + 'Staff Console'; }, [totalUnread]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const L = live.current;
        const order = L.allChannels.map(c => c.id);
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const start = order.indexOf(L.active);
        for (let k = 1; k <= order.length; k++) {
          const id = order[(start + dir * k + order.length * 2) % order.length];
          if (L.unread[id]?.u) { openChannelRef.current(id); break; }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const conn = !sockUp ? 'console' : !botUp ? 'discord' : back ? 'back' : null;

  const app = {
    mode, overlayCtx, effTheme, toggleTheme, me, guild: boot.guild, bot: boot.bot, channels, dms, roles, staff, staffById, names,
    settings, templates, scheduled, queue, view, setView, active, activeCh: getCh(active), getCh, labelOf, messages, unread, divider,
    loading, loadError, highlight, ctxTab, setCtxTab, detail, showDetails, ctxOpen, setCtxOpen, railOpen, setRailOpen,
    railCollapsed, setRailCollapsed: v => { setRailCollapsed(v); store.set('railCollapsed', v); },
    draft, setDraft, picksRef, replyTo, setReplyTo, composerRef, focusComposer, insertText, conn, prefs, setPrefs,
    openChannel, loadOlder, send, retryMsg, discardMsg, askDelete, deleteMsg, editMsg, react, togglePin, copyLink,
    claim, dismiss, openQueueItem, startReply, startDM, updateMe, toggleMute, markAllRead, signOut,
    schedule, unschedule, saveTemplate, saveSettings, toast, fail, setPalette, askConfirm: setConfirm,
    openBuilder: init => { setBuilder(init); if (overlayCtx) setCtxOpen(false); }, closeBuilder: () => setBuilder(null),
    color: hex => readable(hex, effTheme)
  };

  const cls = ['app', 'm-' + mode, railCollapsed && mode !== 'mobile' ? 'rail-collapsed' : '', ctxOpen ? 'ctx-open' : '', railOpen ? 'rail-open' : ''].join(' ');
  return (
    <AppCtx.Provider value={app}>
      <div className={cls}>
        <TopBar />
        <Rail />
        <main className="main" id="main">
          {conn ? (
            <div className={`conn-banner t-caption ${conn === 'back' ? 'back' : ''}`} role="status">
              {conn === 'back' ? <><Icon name="check" size={14} />Back online</>
                : <><span className="spin" aria-hidden="true" />{conn === 'console' ? 'Reconnecting to the console… New messages will appear once it is back.' : 'Reconnecting to Discord… Sending may fail until the bot is back online.'}</>}
            </div>
          ) : null}
          {view === 'channel' ? <ChannelView />
            : view === 'scheduled' ? <ScheduledPage />
            : view === 'audit' ? <AuditPage />
            : <SettingsPage />}
        </main>
        <ContextPanel />
        {(mode === 'mobile' && railOpen) || (overlayCtx && ctxOpen)
          ? <div className="scrim scrim-pane" onClick={() => { setRailOpen(false); setCtxOpen(false); }} /> : null}
      </div>
      {palette ? <Palette /> : null}
      {builder ? <EmbedBuilder init={builder} /> : null}
      {confirm ? <ConfirmDialog cfg={confirm} onClose={() => setConfirm(null)} /> : null}
      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`} role={t.kind === 'error' ? 'alert' : undefined}>
            <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{t.text}</span>
            {t.action ? <button className="toast-act" onClick={() => { t.action.run(); setToasts(x => x.filter(y => y.id !== t.id)); }}>{t.action.label}</button> : null}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
