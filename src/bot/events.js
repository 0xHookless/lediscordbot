import { Events } from 'discord.js';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { client, guild, setBotStatus } from './client.js';
import { serializeMessage } from './serialize.js';
import { broadcast } from '../server/socket.js';
import { consoleChannels, isConsoleChannel, isStaffMember } from '../services/access.js';
import { trackDM } from '../services/dms.js';
import { broadcastStaff } from '../services/staff.js';
import * as queue from '../services/queue.js';

function relevant(m) {
  if (m.guildId) return m.guildId === config.guildId && isConsoleChannel(m.channel);
  return !m.author?.bot || !!db.prepare('SELECT 1 FROM dm_channels WHERE channel_id = ?').get(m.channelId);
}

async function full(m) {
  return m.partial ? m.fetch().catch(() => null) : m;
}

function setStatus(status) {
  setBotStatus(status);
  broadcast('conn', { status });
}

let channelsTimer = null;
function channelsChanged() {
  clearTimeout(channelsTimer);
  channelsTimer = setTimeout(() => broadcast('settings:update', {}), 2000);
}

/** Loads members and recent history so unread counts and the feed work right after a restart. */
async function warmUp() {
  const g = guild();
  if (!g) throw new Error(`The bot isn't in server ${config.guildId}. Invite it first (see README).`);
  await g.members.fetch();
  for (const channel of consoleChannels(true)) await channel.messages.fetch({ limit: 50 }).catch(() => {});
  for (const row of db.prepare('SELECT * FROM dm_channels').all()) {
    const dm = await client.channels.fetch(row.channel_id).catch(() => null);
    await dm?.messages.fetch({ limit: 30 }).catch(() => {});
    await client.users.fetch(row.user_id).catch(() => {});
  }
}

export function registerEvents() {
  client.once(Events.ClientReady, async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    await warmUp().catch(e => console.error('Warm-up failed:', e.message));
    setStatus('live');
  });
  client.on(Events.ShardDisconnect, () => setStatus('down'));
  client.on(Events.ShardReconnecting, () => setStatus('down'));
  client.on(Events.ShardResume, () => setStatus('live'));
  client.on(Events.Error, e => console.error('Discord client error:', e.message));

  client.on(Events.MessageCreate, m => {
    if (!relevant(m)) return;
    // The console broadcasts its own sends once it knows which staff member sent them.
    if (m.author.id === client.user.id) return;
    if (!m.guildId) trackDM(m.channelId, m.author.id);
    if (m.reference?.messageId && isStaffMember(m.member)) queue.resolve(m.reference.messageId);
    if (queue.shouldQueue(m)) queue.add(m);
    broadcast('message:create', { message: serializeMessage(m) });
  });

  client.on(Events.MessageUpdate, async (_old, m) => {
    m = await full(m);
    if (m && relevant(m)) broadcast('message:update', { message: serializeMessage(m) });
  });

  client.on(Events.MessageDelete, m => {
    if (m.guildId && m.guildId !== config.guildId) return;
    queue.resolve(m.id);
    broadcast('message:delete', { channelId: m.channelId, id: m.id });
  });

  const onReaction = async reaction => {
    const m = await full(reaction.message);
    if (m && relevant(m)) broadcast('message:update', { message: serializeMessage(m) });
  };
  client.on(Events.MessageReactionAdd, onReaction);
  client.on(Events.MessageReactionRemove, onReaction);

  client.on(Events.PresenceUpdate, (_old, p) => {
    if (p.guild?.id === config.guildId && isStaffMember(p.member)) broadcastStaff();
  });
  client.on(Events.GuildMemberUpdate, (oldM, newM) => {
    if (newM.guild.id === config.guildId && (isStaffMember(oldM) || isStaffMember(newM))) broadcastStaff();
  });

  client.on(Events.ChannelCreate, channelsChanged);
  client.on(Events.ChannelUpdate, channelsChanged);
  client.on(Events.ChannelDelete, channelsChanged);
}
