const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWelcomeConfig, removeWelcomeConfig, getAutoRoleConfig, removeAutoRoleConfig } = require('../utils/serverData');
const { getAutomodConfig } = require('../utils/automod');

const raidJoinTracker = new Map();

async function logRaidEvent(guild, config, member, count) {
  if (!config.logChannelId) return;

  const logChannel = guild.channels.cache.get(config.logChannelId)
    || await guild.channels.fetch(config.logChannelId).catch(() => null);

  if (!logChannel || !logChannel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(0xff3300)
    .setTitle('🛡️ Automod Raid Alert')
    .addFields(
      { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: 'Violation', value: 'Anti Raid', inline: true },
      { name: 'Punishment', value: config.punishment, inline: true },
      { name: 'Recent Joins', value: String(count), inline: true },
      { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function runAntiRaid(member) {
  if (member.user.bot) return;

  const config = getAutomodConfig(member.guild.id);
  if (!config.enabled || !config.protection.antiRaid) return;

  const now = Date.now();
  const key = member.guild.id;
  const timestamps = raidJoinTracker.get(key) || [];
  const recent = timestamps.filter(ts => now - ts < 30000);
  recent.push(now);
  raidJoinTracker.set(key, recent);

  if (recent.length < 7) return;

  const botMember = member.guild.members.me || await member.guild.members.fetchMe();

  if (config.punishment === 'ban') {
    if (botMember.permissions.has(PermissionFlagsBits.BanMembers) && member.bannable) {
      await member.ban({ reason: 'Automod anti-raid', deleteMessageSeconds: 0 }).catch(() => {});
    }
  } else if (config.punishment === 'kick') {
    if (botMember.permissions.has(PermissionFlagsBits.KickMembers) && member.kickable) {
      await member.kick('Automod anti-raid').catch(() => {});
    }
  } else if (config.punishment === 'timeout') {
    if (botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await member.timeout(10 * 60 * 1000, 'Automod anti-raid').catch(() => {});
    }
  }

  await logRaidEvent(member.guild, config, member, recent.length);
}

const WELCOME_MESSAGES = [
  'Welcome, enjoy your stay',
  'Welcome to the community',
  'Glad to have you here',
  'Welcome and have fun',
  'Hope you enjoy your time here',
  'Thanks for joining',
  'Welcome aboard',
  'Enjoy your stay with us',
];

function pickWelcomeMessage() {
  return WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
}

function createWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle('Welcome')
    .setDescription(`${member}, ${pickWelcomeMessage()}`)
    .setTimestamp();
}

async function handleAutoRole(member) {
  const config = getAutoRoleConfig(member.guild.id);
  if (!config.roleId) return;

  const role = member.guild.roles.cache.get(config.roleId)
    || await member.guild.roles.fetch(config.roleId).catch(() => null);

  if (!role) {
    removeAutoRoleConfig(member.guild.id);
    console.warn(`Auto-role role missing for guild ${member.guild.id}; configuration removed.`);
    return;
  }

  const botMember = member.guild.members.me || await member.guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Missing Manage Roles permission for auto-role in guild ${member.guild.id}.`);
    return;
  }

  if (role.managed) {
    console.warn(`Auto-role ${role.id} in guild ${member.guild.id} is managed and cannot be assigned.`);
    return;
  }

  if (role.position >= botMember.roles.highest.position) {
    console.warn(`Auto-role ${role.id} is higher than the bot's highest role in guild ${member.guild.id}.`);
    return;
  }

  try {
    await member.roles.add(role);
  } catch (error) {
    if (error?.code === 50013) {
      console.warn(`Failed to assign auto-role ${role.id} in guild ${member.guild.id}: missing permissions or hierarchy.`);
      return;
    }

    console.error(`Auto-role assignment error in guild ${member.guild.id}:`, error);
  }
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    if (!member.guild) return;

    try {
      await runAntiRaid(member);
    } catch (error) {
      console.error('Anti-raid error:', error.message);
    }

    await handleAutoRole(member);

    const config = getWelcomeConfig(member.guild.id);
    if (!config.channelId) return;

    const channel = member.guild.channels.cache.get(config.channelId)
      || await member.guild.channels.fetch(config.channelId).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildText) {
      removeWelcomeConfig(member.guild.id);
      console.warn(`Welcome channel missing for guild ${member.guild.id}; configuration removed.`);
      return;
    }

    const botMember = member.guild.members.me || await member.guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      console.warn(`Missing permissions to send welcome message in guild ${member.guild.id}, channel ${channel.id}.`);
      return;
    }

    try {
      await channel.send({
        content: `${member}`,
        embeds: [createWelcomeEmbed(member)],
        allowedMentions: { users: [member.id] },
      });
    } catch (error) {
      console.error('Welcome message error:', error);
    }
  },
};