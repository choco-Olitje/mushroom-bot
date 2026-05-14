const { PermissionFlagsBits } = require('discord.js');
const { readData } = require('./database');
const {
  getTempRoleAssignments,
  getTempRoleAssignment,
  removeTempRoleAssignment,
} = require('./serverData');

const MAX_TIMER_DELAY = 2_147_483_647;
const tempRoleTimers = new Map();

const durationUnits = {
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
};

function parseDuration(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  let totalMs = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const numberStr = parts[i];
    const unitStr = parts[i + 1];

    if (!numberStr || !unitStr) {
      return null;
    }

    const number = parseInt(numberStr, 10);
    const unit = durationUnits[unitStr];

    if (Number.isNaN(number) || number <= 0 || !unit) {
      return null;
    }

    totalMs += number * unit;
  }

  if (totalMs <= 0 || totalMs > 365 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return totalMs;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0ms';

  const units = [
    { label: 'day', ms: 24 * 60 * 60 * 1000 },
    { label: 'hour', ms: 60 * 60 * 1000 },
    { label: 'minute', ms: 60 * 1000 },
    { label: 'second', ms: 1000 },
  ];

  const parts = [];
  let remaining = ms;

  for (const unit of units) {
    const count = Math.floor(remaining / unit.ms);
    if (count > 0) {
      parts.push(`${count} ${unit.label}${count > 1 ? 's' : ''}`);
      remaining -= count * unit.ms;
    }
  }

  return parts.length > 0 ? parts.join(', ') : '0ms';
}

function clearTempRoleTimer(key) {
  const timer = tempRoleTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    tempRoleTimers.delete(key);
  }
}

function scheduleTempRoleExpiry(client, guildId, userId, roleId, expiresAt) {
  const timerKey = `${guildId}:${userId}:${roleId}`;
  clearTempRoleTimer(timerKey);

  const scheduleStep = () => {
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      tempRoleTimers.delete(timerKey);
      removeTempRole(client, guildId, userId, roleId).catch(error => {
        console.error('Failed to remove temp role:', error);
      });
      return;
    }

    const timer = setTimeout(scheduleStep, Math.min(remaining, MAX_TIMER_DELAY));
    tempRoleTimers.set(timerKey, timer);
  };

  scheduleStep();
}

async function removeTempRole(client, guildId, userId, roleId) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    removeTempRoleAssignment(guildId, userId, roleId);
    return;
  }

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    removeTempRoleAssignment(guildId, userId, roleId);
    return;
  }

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    removeTempRoleAssignment(guildId, userId, roleId);
    return;
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Missing Manage Roles permission for temp role removal in guild ${guildId}.`);
    return;
  }

  try {
    await member.roles.remove(role);
    removeTempRoleAssignment(guildId, userId, roleId);
  } catch (error) {
    if (error?.code === 50013) {
      console.warn(`Failed to remove temp role ${role.id} from ${userId} in guild ${guildId}: missing permissions or hierarchy.`);
      removeTempRoleAssignment(guildId, userId, roleId);
      return;
    }

    console.error(`Temp role removal error in guild ${guildId}:`, error);
  }
}

async function initTempRoles(client) {
  const allServers = readData('servers', {});

  for (const [guildId, serverData] of Object.entries(allServers)) {
    const assignments = getTempRoleAssignments(guildId);

    for (const assignment of assignments) {
      const expiresAtMs = Number(assignment.expiresAt) || 0;

      if (expiresAtMs <= Date.now()) {
        await removeTempRole(client, guildId, assignment.userId, assignment.roleId).catch(error => {
          console.error('Failed to process overdue temp role:', error);
        });
        continue;
      }

      scheduleTempRoleExpiry(client, guildId, assignment.userId, assignment.roleId, expiresAtMs);
    }
  }
}

module.exports = {
  parseDuration,
  formatDuration,
  clearTempRoleTimer,
  scheduleTempRoleExpiry,
  removeTempRole,
  initTempRoles,
};
