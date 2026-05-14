const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  createReactionRoleKey,
  normalizeReactionRoleEmoji,
  getReactionRoleConfigs,
  getReactionRoleConfig,
  setReactionRoleConfig,
  removeReactionRoleConfig,
  removeReactionRoleConfigsForMessage,
  removeReactionRoleConfigsForRole,
} = require('./serverData');

function isTextChannelLike(channel) {
  return channel && typeof channel.isTextBased === 'function' && channel.isTextBased() && channel.type !== ChannelType.DM && channel.type !== ChannelType.GroupDM;
}

async function findMessageInGuild(guild, messageId) {
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  for (const channel of guild.channels.cache.values()) {
    if (!isTextChannelLike(channel)) {
      continue;
    }

    if (botMember && channel.permissionsFor(botMember) && !channel.permissionsFor(botMember).has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ])) {
      continue;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      return { message, channel };
    }
  }

  return null;
}

function getEmojiMatchKey(reactionEmoji) {
  if (!reactionEmoji) return null;
  return reactionEmoji.id || reactionEmoji.name || null;
}

async function cleanupStaleReactionRoles(client) {
  let removedCount = 0;

  for (const guild of client.guilds.cache.values()) {
    const configs = getReactionRoleConfigs(guild.id);

    for (const config of configs) {
      const role = guild.roles.cache.get(config.roleId) || await guild.roles.fetch(config.roleId).catch(() => null);
      if (!role) {
        removeReactionRoleConfig(guild.id, config.messageId, config.emojiKey);
        removedCount += 1;
        continue;
      }

      const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
      if (!isTextChannelLike(channel)) {
        removeReactionRoleConfig(guild.id, config.messageId, config.emojiKey);
        removedCount += 1;
        continue;
      }

      const message = await channel.messages.fetch(config.messageId).catch(() => null);
      if (!message) {
        removeReactionRoleConfig(guild.id, config.messageId, config.emojiKey);
        removedCount += 1;
      }
    }
  }

  return removedCount;
}

async function handleReactionRoleAdd(reaction, user) {
  if (!reaction?.message?.guild || user.bot) {
    return false;
  }

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction.message.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  const guild = reaction.message.guild;
  const emojiKey = getEmojiMatchKey(reaction.emoji);
  if (!emojiKey) return false;

  const config = getReactionRoleConfig(guild.id, reaction.message.id, emojiKey);
  if (!config) return false;

  const role = guild.roles.cache.get(config.roleId) || await guild.roles.fetch(config.roleId).catch(() => null);
  if (!role) {
    removeReactionRoleConfig(guild.id, config.messageId, config.emojiKey);
    return true;
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Missing Manage Roles permission for reaction roles in guild ${guild.id}.`);
    return true;
  }

  if (role.managed || role.position >= botMember.roles.highest.position) {
    console.warn(`Reaction role ${role.id} in guild ${guild.id} is not assignable by the bot.`);
    return true;
  }

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return true;

  try {
    await member.roles.add(role);
  } catch (error) {
    if (error?.code === 50013) {
      console.warn(`Failed to add reaction role ${role.id} in guild ${guild.id}: missing permissions or hierarchy.`);
      return true;
    }

    console.error(`Reaction role add error in guild ${guild.id}:`, error);
  }

  return true;
}

async function handleReactionRoleRemove(reaction, user) {
  if (!reaction?.message?.guild || user.bot) {
    return false;
  }

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction.message.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  const guild = reaction.message.guild;
  const emojiKey = getEmojiMatchKey(reaction.emoji);
  if (!emojiKey) return false;

  const config = getReactionRoleConfig(guild.id, reaction.message.id, emojiKey);
  if (!config) return false;

  const role = guild.roles.cache.get(config.roleId) || await guild.roles.fetch(config.roleId).catch(() => null);
  if (!role) {
    removeReactionRoleConfig(guild.id, config.messageId, config.emojiKey);
    return true;
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Missing Manage Roles permission for reaction role removal in guild ${guild.id}.`);
    return true;
  }

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return true;

  try {
    await member.roles.remove(role);
  } catch (error) {
    if (error?.code === 50013) {
      console.warn(`Failed to remove reaction role ${role.id} in guild ${guild.id}: missing permissions or hierarchy.`);
      return true;
    }

    console.error(`Reaction role remove error in guild ${guild.id}:`, error);
  }

  return true;
}

module.exports = {
  createReactionRoleKey,
  normalizeReactionRoleEmoji,
  findMessageInGuild,
  getEmojiMatchKey,
  cleanupStaleReactionRoles,
  handleReactionRoleAdd,
  handleReactionRoleRemove,
  removeReactionRoleConfigsForMessage,
  removeReactionRoleConfigsForRole,
  setReactionRoleConfig,
  getReactionRoleConfig,
  getReactionRoleConfigs,
};