import express from 'express';
import multer from 'multer';
import { audit, allSettings, db, getUser, setSetting } from '../db/db.js';
import { botStatus, client, guild } from '../bot/client.js';
import { serializeMessage } from '../bot/serialize.js';
import { broadcast } from './socket.js';
import {
  channelInfo, consoleChannels, hexOrNull, isAdminMember, isStaffMember, postCheck, resolveChannel, roleLabel, staffRoleIds
} from '../services/access.js';
import { dmChannelObjects, listDMs, trackDM } from '../services/dms.js';
import { HttpError } from '../services/errors.js';
import { broadcastScheduled, listScheduled, listTemplates } from '../services/scheduled.js';
import { buildEmbed, sendMessage, signatureFor, uploadLimitBytes } from '../services/send.js';
import { broadcastStaff, staffRoster } from '../services/staff.js';
import { initReadState, markRead, unreadFor } from '../services/unread.js';
import * as queue from '../services/queue.js';

export const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 10 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SNOWFLAKE = /^\d{15,21}$/;

function snowflake(value, what = 'ID') {
  if (!SNOWFLAKE.test(String(value || ''))) throw new HttpError(400, `That ${what} isn't valid.`);
  return String(value);
}

async function channelOr404(id) {
  const channel = await resolveChannel(id);
  if (!channel) throw new HttpError(404, 'That channel is no longer available to the bot.');
  return channel;
}

async function botMessage(channel, id, req) {
  const message = await channel.messages.fetch(snowflake(id, 'message ID'));
  if (message.author.id !== client.user.id) throw new HttpError(403, 'Only messages sent by the bot can be changed here.');
  const sentBy = db.prepare('SELECT user_id FROM sent_by WHERE message_id = ?').get(message.id);
  if (!req.user.isAdmin && sentBy?.user_id !== req.user.id) throw new HttpError(403, 'Only the staff member who sent this, or an admin, can change it.');
  return message;
}

const requireAdmin = (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'Only admins can do that.' }));

function meInfo(member) {
  const row = getUser(member.id) || { on_duty: 0, signature: 0, muted: '[]' };
  return {
    id: member.id,
    name: member.displayName,
    avatar: member.displayAvatarURL({ size: 64, extension: 'webp' }),
    isAdmin: isAdminMember(member),
    role: roleLabel(member),
    onDuty: !!row.on_duty,
    signature: !!row.signature,
    muted: JSON.parse(row.muted),
    signatureText: signatureFor(member.id)
  };
}

/* ---------- Bootstrap ---------- */
api.get('/bootstrap', wrap(async (req, res) => {
  const { member } = req.user;
  const g = guild();
  db.prepare(`INSERT INTO users (id, name, last_seen) VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`)
    .run(member.id, member.displayName, Date.now());
  const channels = consoleChannels();
  const dms = dmChannelObjects();
  initReadState(member.id, [...channels, ...dms]);
  res.json({
    me: meInfo(member),
    guild: { id: g.id, name: g.name, icon: g.iconURL({ size: 64, extension: 'webp' }), memberCount: g.memberCount, uploadLimit: uploadLimitBytes() },
    bot: { id: client.user.id, name: client.user.displayName ?? client.user.username, avatar: client.user.displayAvatarURL({ size: 64, extension: 'webp' }) },
    channels: channels.map(c => channelInfo(c, member)),
    dms: listDMs(),
    roles: g.roles.cache.filter(r => r.id !== g.id && !r.managed).sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: hexOrNull(r.hexColor), mentionable: r.mentionable })),
    staffRoleIds: staffRoleIds(),
    unread: unreadFor(member.id, [...channels, ...dms]),
    queue: queue.listQueue(),
    staff: staffRoster(),
    templates: listTemplates(),
    scheduled: listScheduled(),
    status: botStatus(),
    settings: req.user.isAdmin ? { ...allSettings(), allChannels: consoleChannels(true).map(c => ({ id: c.id, name: c.name, category: c.parent?.name || 'Channels' })) } : null
  });
}));

/* ---------- Messages ---------- */
api.get('/channels/:id/messages', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const query = { limit: 50 };
  if (req.query.before) query.before = snowflake(req.query.before, 'message ID');
  if (req.query.around) query.around = snowflake(req.query.around, 'message ID');
  const messages = await channel.messages.fetch(query);
  res.json([...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(serializeMessage));
}));

api.post('/channels/:id/messages', upload.array('files', 10), wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const check = postCheck(req.user.member, channel);
  if (!check.ok) throw new HttpError(403, check.reason);
  const body = JSON.parse(req.body.payload || '{}');
  const files = req.files || [];
  const limit = uploadLimitBytes();
  const big = files.find(f => f.size > limit);
  if (big) throw new HttpError(413, `${big.originalname} is ${(big.size / 1048576).toFixed(1)} MB. This server allows up to ${limit / 1048576} MB.`);
  const result = await sendMessage({
    channel,
    userId: req.user.id,
    isAdmin: req.user.isAdmin,
    content: body.content || '',
    replyTo: body.replyTo ? snowflake(body.replyTo, 'message ID') : null,
    ping: body.ping !== false,
    embed: body.embed || null,
    files,
    crosspost: !!body.crosspost,
    signature: !!body.signature
  });
  res.json(result);
}));

api.patch('/channels/:id/messages/:mid', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const message = await botMessage(channel, req.params.mid, req);
  const content = String(req.body.content || '').trim();
  if (!content && !message.embeds.length) throw new HttpError(400, 'A message needs some text. Delete it instead.');
  if (content.length > 2000) throw new HttpError(400, `That message is ${content.length.toLocaleString()} characters. Discord allows 2,000.`);
  if (/@(everyone|here)\b/.test(content) && !req.user.isAdmin) throw new HttpError(403, 'Only admins can ping @everyone or @here.');
  const edited = await message.edit({ content: content || null });
  audit({ userId: req.user.id, action: 'Edited', channelId: channel.id, messageId: message.id, content });
  res.json({ message: serializeMessage(edited) });
}));

api.delete('/channels/:id/messages/:mid', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const message = await botMessage(channel, req.params.mid, req);
  const snapshot = message.content || message.embeds[0]?.title || message.attachments.first()?.name || '';
  await message.delete();
  audit({ userId: req.user.id, action: 'Deleted', channelId: channel.id, messageId: message.id, content: snapshot });
  res.json({ ok: true });
}));

api.post('/channels/:id/messages/:mid/reactions', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const message = await channel.messages.fetch(snowflake(req.params.mid, 'message ID'));
  const key = String(req.body.emoji || '');
  if (!key || key.length > 100) throw new HttpError(400, 'Pick an emoji to react with.');
  const existing = message.reactions.cache.find(r => (r.emoji.id ? r.emoji.identifier : r.emoji.name) === key);
  if (existing?.me) await existing.users.remove(client.user.id);
  else await message.react(key);
  res.json({ message: serializeMessage(await message.fetch()) });
}));

api.post('/channels/:id/messages/:mid/pin', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  const message = await channel.messages.fetch(snowflake(req.params.mid, 'message ID'));
  if (req.body.pinned) await message.pin(); else await message.unpin();
  audit({ userId: req.user.id, action: req.body.pinned ? 'Pinned' : 'Unpinned', channelId: channel.id, messageId: message.id, content: message.content || message.embeds[0]?.title || '' });
  res.json({ message: serializeMessage(await message.fetch()) });
}));

api.post('/channels/:id/read', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  markRead(req.user.id, channel.id, snowflake(req.body.messageId, 'message ID'));
  res.json({ ok: true });
}));

api.post('/read-all', wrap(async (req, res) => {
  for (const c of [...consoleChannels(), ...dmChannelObjects()]) if (c.lastMessageId) markRead(req.user.id, c.id, c.lastMessageId);
  res.json({ ok: true });
}));

const lastTyping = new Map();
api.post('/channels/:id/typing', wrap(async (req, res) => {
  const channel = await channelOr404(req.params.id);
  if (Date.now() - (lastTyping.get(channel.id) || 0) > 8000) {
    lastTyping.set(channel.id, Date.now());
    channel.sendTyping().catch(() => {});
  }
  res.json({ ok: true });
}));

/* ---------- Direct messages and members ---------- */
api.post('/dms', wrap(async (req, res) => {
  const userId = snowflake(req.body.userId, 'member ID');
  const member = guild().members.cache.get(userId) || await guild().members.fetch(userId).catch(() => null);
  if (!member) throw new HttpError(404, "That member isn't in the server anymore.");
  if (member.user.bot) throw new HttpError(400, "Bots can't receive direct messages from the console.");
  const dm = await member.user.createDM();
  trackDM(dm.id, userId);
  res.json({ dm: listDMs().find(d => d.id === dm.id) });
}));

api.get('/members', wrap(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const matches = [...guild().members.cache.values()]
    .filter(m => !m.user.bot && (m.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.displayName.toLowerCase().startsWith(q)) - Number(a.displayName.toLowerCase().startsWith(q)))
    .slice(0, 8)
    .map(m => ({ id: m.id, name: m.displayName, username: m.user.username, avatar: m.displayAvatarURL({ size: 64, extension: 'webp' }), staff: isStaffMember(m) }));
  res.json(matches);
}));

api.get('/members/:id', wrap(async (req, res) => {
  const id = snowflake(req.params.id, 'member ID');
  const member = guild().members.cache.get(id) || await guild().members.fetch(id).catch(() => null);
  if (!member) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) throw new HttpError(404, 'That member could not be found.');
    return res.json({ id, name: user.globalName || user.username, username: user.username, avatar: user.displayAvatarURL({ size: 128 }), inServer: false, bot: user.bot, createdAt: user.createdTimestamp });
  }
  res.json({
    id,
    name: member.displayName,
    username: member.user.username,
    avatar: member.displayAvatarURL({ size: 128, extension: 'webp' }),
    color: hexOrNull(member.displayHexColor),
    roles: member.roles.cache.filter(r => r.id !== guild().id).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: hexOrNull(r.hexColor) })),
    status: member.presence?.status || 'offline',
    joinedAt: member.joinedTimestamp,
    createdAt: member.user.createdTimestamp,
    staff: isStaffMember(member),
    onDuty: !!getUser(id)?.on_duty,
    bot: member.user.bot,
    inServer: true
  });
}));

/* ---------- The signed-in staff member ---------- */
api.patch('/me', wrap(async (req, res) => {
  const { onDuty, signature, muted } = req.body;
  if (typeof onDuty === 'boolean') {
    db.prepare('UPDATE users SET on_duty = ? WHERE id = ?').run(onDuty ? 1 : 0, req.user.id);
    broadcastStaff(0);
  }
  if (typeof signature === 'boolean') db.prepare('UPDATE users SET signature = ? WHERE id = ?').run(signature ? 1 : 0, req.user.id);
  if (Array.isArray(muted)) db.prepare('UPDATE users SET muted = ? WHERE id = ?').run(JSON.stringify(muted.filter(id => SNOWFLAKE.test(id))), req.user.id);
  res.json({ me: meInfo(req.user.member) });
}));

/* ---------- Needs reply queue ---------- */
api.post('/queue/:mid/claim', wrap(async (req, res) => {
  const changed = queue.claim(snowflake(req.params.mid, 'message ID'), req.body.claim === false ? null : req.user.id);
  if (!changed) throw new HttpError(404, 'That item was already answered.');
  res.json({ ok: true });
}));

api.post('/queue/:mid/dismiss', wrap(async (req, res) => {
  const messageId = snowflake(req.params.mid, 'message ID');
  const item = db.prepare('SELECT channel_id, content FROM queue WHERE message_id = ?').get(messageId);
  if (!queue.resolve(messageId)) throw new HttpError(404, 'That item was already answered.');
  audit({ userId: req.user.id, action: 'Dismissed', channelId: item?.channel_id, messageId, content: item?.content || '' });
  res.json({ ok: true });
}));

/* ---------- Templates ---------- */
api.post('/templates', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, 'Give the template a name.');
  buildEmbed(req.body.embed || {});
  db.prepare(`INSERT INTO templates (name, data, created_by, created_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(name) DO UPDATE SET data = excluded.data`)
    .run(name, JSON.stringify(req.body.embed), req.user.id, Date.now());
  broadcast('templates:update', { templates: listTemplates() });
  res.json({ templates: listTemplates() });
}));

api.delete('/templates/:id', wrap(async (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(Number(req.params.id));
  broadcast('templates:update', { templates: listTemplates() });
  res.json({ templates: listTemplates() });
}));

/* ---------- Scheduled posts ---------- */
async function validateScheduled(req) {
  const { channelId, runAt, payload = {} } = req.body;
  const channel = await channelOr404(String(channelId || ''));
  if (!channel.guildId) throw new HttpError(400, 'Scheduled posts go to server channels, not direct messages.');
  const check = postCheck(req.user.member, channel);
  if (!check.ok) throw new HttpError(403, check.reason);
  const when = Number(runAt);
  if (!Number.isFinite(when) || when < Date.now() + 30_000) throw new HttpError(400, 'Pick a time at least a minute from now.');
  const content = String(payload.content || '').trim();
  const pingsEveryone = /@(everyone|here)\b/.test(content);
  if (pingsEveryone && !req.user.isAdmin) throw new HttpError(403, 'Only admins can ping @everyone or @here.');
  if (content.length > 2000) throw new HttpError(400, 'Scheduled messages can be up to 2,000 characters.');
  if (payload.embed) buildEmbed(payload.embed);
  else if (!content) throw new HttpError(400, 'Add a message or build an embed to schedule.');
  return { channel, when, payload: { content, embed: payload.embed || null, crosspost: !!payload.crosspost, allowEveryone: pingsEveryone } };
}

const describe = p => p.embed ? `${p.embed.title || p.embed.description} (embed)` : p.content;

api.post('/scheduled', wrap(async (req, res) => {
  const { channel, when, payload } = await validateScheduled(req);
  db.prepare('INSERT INTO scheduled (channel_id, run_at, payload, created_by, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(channel.id, when, JSON.stringify(payload), req.user.id, Date.now());
  audit({ userId: req.user.id, action: 'Scheduled', channelId: channel.id, content: describe(payload) });
  broadcastScheduled();
  res.json({ scheduled: listScheduled() });
}));

function ownScheduled(req) {
  const row = db.prepare('SELECT * FROM scheduled WHERE id = ?').get(Number(req.params.id));
  if (!row || row.status === 'sent') throw new HttpError(404, 'That post already went out or was removed.');
  if (!req.user.isAdmin && row.created_by !== req.user.id) throw new HttpError(403, 'Only the person who scheduled this, or an admin, can change it.');
  return row;
}

api.patch('/scheduled/:id', wrap(async (req, res) => {
  const row = ownScheduled(req);
  const { channel, when, payload } = await validateScheduled(req);
  db.prepare("UPDATE scheduled SET channel_id = ?, run_at = ?, payload = ?, status = 'pending', error = NULL, updated_at = ? WHERE id = ?")
    .run(channel.id, when, JSON.stringify(payload), Date.now(), row.id);
  audit({ userId: req.user.id, action: 'Schedule edited', channelId: channel.id, content: describe(payload) });
  broadcastScheduled();
  res.json({ scheduled: listScheduled() });
}));

api.delete('/scheduled/:id', wrap(async (req, res) => {
  const row = ownScheduled(req);
  db.prepare('DELETE FROM scheduled WHERE id = ?').run(row.id);
  audit({ userId: req.user.id, action: 'Schedule removed', channelId: row.channel_id, content: describe(JSON.parse(row.payload)) });
  broadcastScheduled();
  res.json({ scheduled: listScheduled() });
}));

/* ---------- Audit log ---------- */
api.get('/audit', wrap(async (req, res) => {
  const where = [];
  const args = [];
  if (req.query.userId) { where.push('user_id = ?'); args.push(String(req.query.userId)); }
  if (req.query.channelId) { where.push('channel_id = ?'); args.push(String(req.query.channelId)); }
  if (req.query.action) { where.push('action = ?'); args.push(String(req.query.action)); }
  if (req.query.before) { where.push('id < ?'); args.push(Number(req.query.before)); }
  const rows = db.prepare(`SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 101`).all(...args);
  const members = guild().members.cache;
  const dmNames = Object.fromEntries(listDMs().map(d => [d.id, d.name]));
  const entries = rows.slice(0, 100).map(r => {
    const channel = r.channel_id ? guild().channels.cache.get(r.channel_id) : null;
    return {
      id: r.id,
      at: r.at,
      userId: r.user_id,
      userName: members.get(r.user_id)?.displayName || getUser(r.user_id)?.name || 'Former staff',
      userAvatar: members.get(r.user_id)?.displayAvatarURL({ size: 64, extension: 'webp' }) || null,
      action: r.action,
      channelId: r.channel_id,
      channelLabel: channel ? `#${channel.name}` : dmNames[r.channel_id] ? `@${dmNames[r.channel_id]}` : r.channel_id ? 'Deleted channel' : '',
      messageId: r.message_id,
      content: r.content
    };
  });
  const actions = db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all().map(r => r.action);
  res.json({ entries, more: rows.length > 100, actions });
}));

/* ---------- Settings (admins) ---------- */
api.put('/settings', requireAdmin, wrap(async (req, res) => {
  const ids = value => (Array.isArray(value) ? value.filter(id => SNOWFLAKE.test(id)) : []);
  const { staffRoles, supportChannels, hiddenChannels, postRoles, signatureFormat } = req.body;
  if (staffRoles) setSetting('staffRoles', ids(staffRoles));
  if (supportChannels) setSetting('supportChannels', ids(supportChannels));
  if (hiddenChannels) setSetting('hiddenChannels', ids(hiddenChannels));
  if (postRoles && typeof postRoles === 'object') {
    setSetting('postRoles', Object.fromEntries(Object.entries(postRoles).filter(([k]) => SNOWFLAKE.test(k)).map(([k, v]) => [k, ids(v)]).filter(([, v]) => v.length)));
  }
  if (typeof signatureFormat === 'string') {
    const format = signatureFormat.trim().slice(0, 100);
    if (!format) throw new HttpError(400, 'The signature format can’t be empty. Use {first} and {role}, for example.');
    setSetting('signatureFormat', format);
  }
  audit({ userId: req.user.id, action: 'Settings changed', content: Object.keys(req.body).join(', ') });
  broadcast('settings:update', {});
  broadcastStaff(0);
  res.json({ settings: allSettings() });
}));
