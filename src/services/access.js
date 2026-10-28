import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { config } from '../config.js';
import { db, getSetting } from '../db/db.js';
import { client, guild } from '../bot/client.js';

const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

export const staffRoleIds = () => getSetting('staffRoles');

export function isAdminMember(member) {
  return member.permissions.has(P.Administrator) || member.roles.cache.some(r => config.adminRoleIds.includes(r.id));
}

export function isStaffMember(member) {
  if (!member || member.user.bot) return false;
  const ids = staffRoleIds();
  return isAdminMember(member) || member.roles.cache.some(r => ids.includes(r.id));
}

export function primaryRole(member) {
  const ids = staffRoleIds();
  return member.roles.cache.filter(r => ids.includes(r.id)).sort((a, b) => b.position - a.position).first() || null;
}

export function roleLabel(member) {
  const role = primaryRole(member);
  return role ? role.name : isAdminMember(member) ? 'Admin' : 'Staff';
}

export const hexOrNull = hex => (hex && hex !== '#000000' ? hex : null);

function botCan(channel, perms) {
  const me = channel.guild.members.me;
  return !!me && channel.permissionsFor(me).has(perms);
}

export function isConsoleChannel(channel, includeHidden = false) {
  return !!channel
    && channel.guildId === config.guildId
    && TEXT_TYPES.includes(channel.type)
    && botCan(channel, [P.ViewChannel, P.ReadMessageHistory])
    && (includeHidden || !getSetting('hiddenChannels').includes(channel.id));
}

export function consoleChannels(includeHidden = false) {
  const g = guild();
  if (!g) return [];
  return [...g.channels.cache.values()]
    .filter(c => isConsoleChannel(c, includeHidden))
    .sort((a, b) => ((a.parent?.position ?? -1) - (b.parent?.position ?? -1)) || (a.position - b.position));
}

export function postCheck(member, channel) {
  if (!channel.guildId) return { ok: true };
  if (!botCan(channel, [P.SendMessages])) {
    return { ok: false, reason: `The bot can't post in #${channel.name}. Give it Send Messages there in Discord.` };
  }
  const allowed = getSetting('postRoles')[channel.id] || [];
  if (allowed.length && !isAdminMember(member) && !member.roles.cache.some(r => allowed.includes(r.id))) {
    return { ok: false, reason: `${roleLabel(member)} can't post in #${channel.name}. Ask an admin.` };
  }
  return { ok: true };
}

export function channelInfo(channel, member) {
  const check = postCheck(member, channel);
  return {
    id: channel.id,
    name: channel.name,
    kind: channel.type === ChannelType.GuildAnnouncement ? 'announce' : 'text',
    category: channel.parent?.name || 'Channels',
    topic: channel.topic || '',
    canPost: check.ok,
    lockedReason: check.ok ? null : check.reason
  };
}

/** A console channel or a tracked DM channel, or null when staff shouldn't reach it. */
export async function resolveChannel(id) {
  if (!/^\d{15,21}$/.test(id)) return null;
  const g = guild();
  const channel = g?.channels.cache.get(id);
  if (channel) return isConsoleChannel(channel) ? channel : null;
  const tracked = db.prepare('SELECT 1 FROM dm_channels WHERE channel_id = ?').get(id);
  return tracked ? client.channels.fetch(id).catch(() => null) : null;
}
