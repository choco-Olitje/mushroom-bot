const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

const BULK_DELETE_LIMIT = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
const MAX_AMOUNT = 100;
const MIN_AMOUNT = 1;
const BATCH_SIZE = 100; // Discord's max bulk delete is 100 per request

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mass-delete')
    .setDescription('[PREMIUM] Delete multiple messages efficiently')
    .addNumberOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(MIN_AMOUNT)
        .setMaxValue(MAX_AMOUNT)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel (default: current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Filter messages from specific user')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Check admin permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      const amount = interaction.options.getNumber('amount');
      const targetChannel = interaction.options.getChannel('channel');
      const targetUser = interaction.options.getUser('user');

      // Determine which case we're in
      if (targetUser) {
        // Cases 3 & 4: User-specific deletion
        await handleUserDeletion(interaction, amount, targetChannel);
      } else if (targetChannel) {
        // Case 2: Channel-specific deletion
        await handleChannelDeletion(interaction, amount, targetChannel);
      } else if (interaction.channel?.type === ChannelType.GuildText) {
        // Case 1: Current channel deletion
        await handleChannelDeletion(interaction, amount, interaction.channel);
      } else {
        return await interaction.editReply({
          embeds: [createErrorEmbed('❌ Error', 'This command can only be used in a text channel.')],
        });
      }
    } catch (error) {
      console.error('mass-delete command error:', error);
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while deleting messages.')],
        ephemeral: true,
      });
    }
  },
};

/**
 * Case 1 & 2: Delete from a specific channel
 */
async function handleChannelDeletion(interaction, amount, channel) {
  try {
    // Check channel accessibility
    if (!channel.permissionsFor(interaction.guild.members.me).has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
    ])) {
      return await interaction.editReply({
        embeds: [createErrorEmbed('❌ Missing Permissions', `I lack required permissions in ${channel}.`)],
        ephemeral: true,
      });
    }

    const deleted = await deleteMessagesFromChannel(channel, amount);
    return await interaction.editReply({
      embeds: [createSuccessEmbed(
        '✅ Messages Deleted',
        `Successfully deleted **${deleted}** message(s) from ${channel}.`
      )],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Channel deletion error:', error);
    return await interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'Failed to delete messages from that channel.')],
      ephemeral: true,
    });
  }
}

/**
 * Cases 3 & 4: Delete messages from a specific user
 */
async function handleUserDeletion(interaction, amount, targetChannel) {
  try {
    const targetUser = interaction.options.getUser('user');

    if (targetChannel) {
      // Case 4: User in specific channel
      if (!targetChannel.permissionsFor(interaction.guild.members.me).has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ])) {
        return await interaction.editReply({
          embeds: [createErrorEmbed('❌ Missing Permissions', `I lack required permissions in ${targetChannel}.`)],
          ephemeral: true,
        });
      }

      const deleted = await deleteUserMessagesFromChannel(targetChannel, targetUser.id, amount);
      return await interaction.editReply({
        embeds: [createSuccessEmbed(
          '✅ Messages Deleted',
          `Successfully deleted **${deleted}** message(s) from ${targetUser.tag} in ${targetChannel}.`
        )],
        ephemeral: true,
      });
    } else {
      // Case 3: User across all accessible channels
      const deleted = await deleteUserMessagesAcrossGuild(interaction.guild, targetUser.id, amount);
      return await interaction.editReply({
        embeds: [createSuccessEmbed(
          '✅ Messages Deleted',
          `Successfully deleted **${deleted}** message(s) from ${targetUser.tag} across the server.`
        )],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('User deletion error:', error);
    return await interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'Failed to delete messages.')],
      ephemeral: true,
    });
  }
}

/**
 * Delete up to {amount} recent messages from a channel
 */
async function deleteMessagesFromChannel(channel, amount) {
  let deleted = 0;

  while (deleted < amount) {
    const remaining = amount - deleted;
    const fetchCount = Math.min(remaining, BATCH_SIZE);

    try {
      // Fetch recent messages
      const messages = await channel.messages.fetch({ limit: fetchCount });

      if (messages.size === 0) break; // No more messages

      // Separate by age (14-day limit for bulk delete)
      const now = Date.now();
      const recent = [];
      const old = [];

      for (const msg of messages.values()) {
        if (now - msg.createdTimestamp < BULK_DELETE_LIMIT) {
          recent.push(msg);
        } else {
          old.push(msg);
        }
      }

      // Bulk delete recent messages (Discord requires 2+ messages)
      if (recent.length > 1) {
        try {
          const result = await channel.bulkDelete(recent, true);
          deleted += result.size;
        } catch (bulkErr) {
          console.error('Bulk delete error:', bulkErr.message);
          // Fall back to individual deletion
          for (const msg of recent) {
            try {
              await msg.delete();
              deleted += 1;
            } catch (err) {
              console.error('Individual delete error:', err.message);
            }
          }
        }
      } else if (recent.length === 1) {
        // Single recent message - delete individually
        try {
          await recent[0].delete();
          deleted += 1;
        } catch (err) {
          console.error('Individual delete error:', err.message);
        }
      }

      // Delete old messages individually (with rate limit awareness)
      for (const msg of old) {
        try {
          await msg.delete();
          deleted += 1;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error('Old message delete error:', err.message);
        }
      }
    } catch (error) {
      console.error('Fetch error:', error.message);
      break;
    }
  }

  return deleted;
}

/**
 * Delete up to {amount} messages from specific user in a channel
 */
async function deleteUserMessagesFromChannel(channel, userId, amount) {
  let deleted = 0;
  let lastMessageId = null;

  while (deleted < amount) {
    try {
      const options = { limit: BATCH_SIZE };
      if (lastMessageId) options.before = lastMessageId;

      const messages = await channel.messages.fetch(options);

      if (messages.size === 0) break;

      // Filter messages from target user
      const userMessages = messages.filter(msg => msg.author.id === userId);

      if (userMessages.size === 0) {
        // No more messages from this user - try older messages
        lastMessageId = messages.last().id;
        continue;
      }

      // Separate by age
      const now = Date.now();
      const recent = [];
      const old = [];

      for (const msg of userMessages.values()) {
        if (now - msg.createdTimestamp < BULK_DELETE_LIMIT) {
          recent.push(msg);
        } else {
          old.push(msg);
        }
      }

      // Bulk delete recent
      if (recent.length > 1) {
        try {
          const result = await channel.bulkDelete(recent, true);
          deleted += result.size;
        } catch (bulkErr) {
          for (const msg of recent) {
            try {
              await msg.delete();
              deleted += 1;
              if (deleted >= amount) break;
            } catch (err) {
              console.error('Individual delete error:', err.message);
            }
          }
        }
      } else if (recent.length === 1) {
        try {
          await recent[0].delete();
          deleted += 1;
        } catch (err) {
          console.error('Individual delete error:', err.message);
        }
      }

      // Delete old individually
      for (const msg of old) {
        if (deleted >= amount) break;
        try {
          await msg.delete();
          deleted += 1;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error('Old message delete error:', err.message);
        }
      }

      if (deleted >= amount) break;
      lastMessageId = messages.last().id;
    } catch (error) {
      console.error('Fetch error:', error.message);
      break;
    }
  }

  return deleted;
}

/**
 * Delete up to {amount} messages from specific user across all guild channels
 */
async function deleteUserMessagesAcrossGuild(guild, userId, amount) {
  let deleted = 0;

  // Get all text channels bot can access
  const channels = guild.channels.cache.filter(ch =>
    ch.type === ChannelType.GuildText &&
    ch.permissionsFor(guild.members.me).has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
    ])
  );

  if (channels.size === 0) {
    throw new Error('No accessible channels in guild.');
  }

  // Search channels for user messages
  for (const channel of channels.values()) {
    if (deleted >= amount) break;

    let lastMessageId = null;

    while (deleted < amount) {
      try {
        const options = { limit: BATCH_SIZE };
        if (lastMessageId) options.before = lastMessageId;

        const messages = await channel.messages.fetch(options);

        if (messages.size === 0) break;

        // Filter for target user
        const userMessages = messages.filter(msg => msg.author.id === userId);

        if (userMessages.size === 0) {
          lastMessageId = messages.last().id;
          continue;
        }

        // Separate by age
        const now = Date.now();
        const recent = [];
        const old = [];

        for (const msg of userMessages.values()) {
          if (now - msg.createdTimestamp < BULK_DELETE_LIMIT) {
            recent.push(msg);
          } else {
            old.push(msg);
          }
        }

        // Bulk delete recent
        if (recent.length > 1) {
          try {
            const result = await channel.bulkDelete(recent, true);
            deleted += result.size;
          } catch (bulkErr) {
            for (const msg of recent) {
              if (deleted >= amount) break;
              try {
                await msg.delete();
                deleted += 1;
              } catch (err) {
                console.error('Individual delete error:', err.message);
              }
            }
          }
        } else if (recent.length === 1) {
          try {
            await recent[0].delete();
            deleted += 1;
          } catch (err) {
            console.error('Individual delete error:', err.message);
          }
        }

        // Delete old individually
        for (const msg of old) {
          if (deleted >= amount) break;
          try {
            await msg.delete();
            deleted += 1;
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            console.error('Old message delete error:', err.message);
          }
        }

        if (deleted >= amount) break;
        lastMessageId = messages.last().id;
      } catch (error) {
        console.error(`Fetch error in channel ${channel.id}:`, error.message);
        break;
      }
    }

    if (deleted >= amount) break;
  }

  return deleted;
}
