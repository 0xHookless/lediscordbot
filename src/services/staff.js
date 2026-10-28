import { db } from '../db/db.js';
import { guild } from '../bot/client.js';
import { hexOrNull, isAdminMember, isStaffMember, primaryRole, staffRoleIds } from './access.js';
import { broadcast } from '../server/socket.js';

export function staffRoster() {
  const g = guild();
  if (!g) return { groups: [], members: [] };
  const duty = Object.fromEntries(db.prepare('SELECT id, on_duty FROM users').all().map(r => [r.id, !!r.on_duty]));
  const groups = staffRoleIds().map(id => g.roles.cache.get(id)).filter(Boolean)
    .sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: hexOrNull(r.hexColor) }));
  const members = [...g.members.cache.values()].filter(isStaffMember).map(m => ({
    id: m.id,
    name: m.displayName,
    avatar: m.displayAvatarURL({ size: 64, extension: 'webp' }),
    roleId: primaryRole(m)?.id || 'admin',
    status: m.presence?.status || 'offline',
    onDuty: !!duty[m.id],
    isAdmin: isAdminMember(m)
  })).sort((a, b) => a.name.localeCompare(b.name));
  if (members.some(m => m.roleId === 'admin')) groups.unshift({ id: 'admin', name: 'Admins', color: null });
  return { groups, members };
}

let timer = null;
/** Presence updates arrive in bursts, so roster broadcasts are batched. */
export function broadcastStaff(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => broadcast('staff:update', { staff: staffRoster() }), delay);
}
