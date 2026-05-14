const { readData } = require('./database');
const { getBirthdaysForDate, getBirthdayConfig, addBirthdayRoleAssignment, removeBirthdayRoleAssignment, getBirthdayRoleAssignments, getAllBirthdays } = require('./serverData');
const { EmbedBuilder } = require('discord.js');
const { createErrorEmbed } = require('./embeds');

const DAY_MS = 24 * 60 * 60 * 1000;

function createBirthdayEmbed(userTag) {
  return new EmbedBuilder()
    .setColor(0xFFD166)
    .setTitle('🎉 Happy Birthday!')
    .setDescription(`Happy Birthday ${userTag}! We hope you have an amazing day!`)
    .setTimestamp()
    .setFooter({ text: 'Ultimate Discord Bot' });
}

async function sendBirthdayMessage(client, guild, channelId, userId) {
  try {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return { ok: false, reason: 'Missing channel' };

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'Member not found' };

    const embed = createBirthdayEmbed(`<@${userId}>`);
    await channel.send({ content: `<@${userId}>`, embeds: [embed] });
    return { ok: true };
  } catch (error) {
    console.error('Error sending birthday message:', error);
    return { ok: false, reason: 'Send failed' };
  }
}

async function assignBirthdayRole(client, guild, userId, roleId) {
  try {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'Member not found' };

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return { ok: false, reason: 'Role not found' };

    if (member.roles.cache.has(roleId)) return { ok: true, assigned: false }; // already has role

    await member.roles.add(roleId, 'Birthday role assigned by bot');

    return { ok: true, assigned: true };
  } catch (error) {
    console.error('Error assigning birthday role:', error);
    return { ok: false, reason: 'Assign failed' };
  }
}

async function removeBirthdayRole(client, guild, userId, roleId) {
  try {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'Member not found' };

    if (!member.roles.cache.has(roleId)) return { ok: true, removed: false };

    await member.roles.remove(roleId, 'Birthday role expired');
    return { ok: true, removed: true };
  } catch (error) {
    console.error('Error removing birthday role:', error);
    return { ok: false, reason: 'Removal failed' };
  }
}

async function processTodayBirthdays(client) {
  const servers = readData('servers', {});
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;

  for (const [serverId, serverData] of Object.entries(servers)) {
    try {
      const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
      if (!guild) continue;

      const config = getBirthdayConfig(serverId);
      if (!config || !config.channelId) continue; // no channel configured

      const matches = [];
      // Use serverData.birthdays if present
      const birthdays = serverData.birthdays || {};
      for (const [userId, info] of Object.entries(birthdays)) {
        if (Number(info.day) === day && Number(info.month) === month) matches.push({ userId, raw: info.raw });
      }

      for (const match of matches) {
        // send message
        await sendBirthdayMessage(client, guild, config.channelId, match.userId).catch(() => null);

        // assign role if configured
        if (config.roleId) {
          const assignRes = await assignBirthdayRole(client, guild, match.userId, config.roleId);
          if (assignRes.ok && assignRes.assigned) {
            const expiresAt = Date.now() + DAY_MS; // 24 hours
            addBirthdayRoleAssignment(serverId, match.userId, config.roleId, expiresAt);
            // schedule removal
            scheduleRemoval(client, serverId, match.userId, config.roleId, expiresAt);
          }
        }
      }
    } catch (err) {
      console.error('Error processing birthdays for server', serverId, err);
    }
  }
}

// Schedule removal of a role at given timestamp (persisted assignments handled on init)
function scheduleRemoval(client, serverId, userId, roleId, expiresAt) {
  const delay = Math.max(0, expiresAt - Date.now());
  setTimeout(async () => {
    try {
      const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
      if (!guild) return;
      await removeBirthdayRole(client, guild, userId, roleId);
      removeBirthdayRoleAssignment(serverId, userId);
    } catch (e) {
      console.error('Scheduled removal failed', e);
    }
  }, delay + 1000);
}

async function processPendingAssignments(client) {
  const servers = readData('servers', {});
  for (const [serverId, serverData] of Object.entries(servers)) {
    const assignments = (serverData.birthdayRoleAssignments) || {};
    for (const [userId, info] of Object.entries(assignments)) {
      const { roleId, expiresAt } = info;
      if (!roleId || !expiresAt) continue;

      if (Date.now() >= expiresAt) {
        // expired: remove now
        try {
          const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
          if (guild) {
            await removeBirthdayRole(client, guild, userId, roleId);
          }
        } catch (e) {
          console.error('Error removing expired birthday role', e);
        }
        removeBirthdayRoleAssignment(serverId, userId);
      } else {
        // schedule remaining time
        scheduleRemoval(client, serverId, userId, roleId, expiresAt);
      }
    }
  }
}

let dailyInterval = null;

async function init(client) {
  // Process any pending role assignments from storage
  await processPendingAssignments(client);

  // Run today's birthdays immediately on startup (so if bot restarts on someone's birthday, it's still processed)
  await processTodayBirthdays(client);

  // Schedule daily check at next midnight
  if (dailyInterval) clearInterval(dailyInterval);

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0, 0); // 00:05 next day
  const initialDelay = next - now;

  setTimeout(() => {
    processTodayBirthdays(client).catch(console.error);
    dailyInterval = setInterval(() => processTodayBirthdays(client).catch(console.error), DAY_MS);
  }, initialDelay);
}

module.exports = {
  init,
  processTodayBirthdays,
};
