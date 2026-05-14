const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWelcomeConfig, removeWelcomeConfig, getAutoRoleConfig, removeAutoRoleConfig } = require('../utils/serverData');

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