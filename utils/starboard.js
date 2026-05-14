const { EmbedBuilder, ChannelType } = require('discord.js');
const {
  getStarboardConfig,
  getStarboardEntry,
  setStarboardEntry,
  removeStarboardEntry,
} = require('./serverData');

/**
 * Create a starboard embed from a message
 */
function createStarboardEmbed(message, starCount) {
  const author = message.author;
  const channel = message.channel;
  
  let description = '';
  
  // Add message content
  if (message.content) {
    description += `**Message:**\n${message.content}\n\n`;
  } else if (!message.attachments.size && !message.embeds.length) {
    description += '**Message:** *(empty message)*\n\n';
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFD700) // Gold color for stars
    .setTitle(`⭐ ${starCount} Star${starCount !== 1 ? 's' : ''}`)
    .setDescription(description)
    .setAuthor({
      name: author.username,
      iconURL: author.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      {
        name: 'Channel',
        value: `${channel}`,
        inline: false,
      },
      {
        name: 'Jump to Message',
        value: `[Click here](${message.url})`,
        inline: false,
      }
    )
    .setTimestamp(message.createdTimestamp)
    .setFooter({ text: 'Originally posted' });

  return embed;
}

/**
 * Handle star reaction added
 */
async function handleStarReactionAdd(reaction, user, client) {
  try {
    // Ignore bot reactions
    if (user.bot) return false;

    // Only handle star emoji
    if (reaction.emoji.name !== '⭐') return false;

    const message = reaction.message;
    
    // Ignore bot messages
    if (message.author.bot) return false;

    // Ignore if no guild
    if (!message.guild) return false;

    // Ignore if reaction is from message author
    if (user.id === message.author.id) return false;

    // Get starboard config
    const config = getStarboardConfig(message.guildId);
    if (!config.channelId || !config.requiredStars) return false;

    // Get starboard channel
    let starboardChannel;
    try {
      starboardChannel = await client.channels.fetch(config.channelId);
    } catch (error) {
      console.log(`Starboard channel ${config.channelId} not found or bot can't access it`);
      return false;
    }

    // Verify it's a text channel
    if (!starboardChannel || starboardChannel.type !== ChannelType.GuildText) {
      console.log('Starboard channel is not a text channel');
      return false;
    }

    // Get current star count
    const starReaction = message.reactions.cache.get('⭐');
    const starCount = starReaction ? starReaction.count : 0;

    // Check if message should be posted
    if (starCount < config.requiredStars) return true;

    // Check if already posted to starboard
    let entry = getStarboardEntry(message.guildId, message.id);

    if (entry && entry.starboardMessageId) {
      // Update existing starboard post
      try {
        const starboardMessage = await starboardChannel.messages.fetch(entry.starboardMessageId);
        if (starboardMessage) {
          const embed = createStarboardEmbed(message, starCount);
          await starboardMessage.edit({ embeds: [embed] });
          // Update star count in entry
          entry.starCount = starCount;
          setStarboardEntry(message.guildId, message.id, entry);
          return true;
        }
      } catch (error) {
        console.log(`Failed to update starboard message: ${error.message}`);
        // Fall through to create new one
      }
    }

    // Create new starboard post
    try {
      // Collect all attachments and embeds to include
      const files = [];
      const embeds = [createStarboardEmbed(message, starCount)];

      // Add media from original message (images/attachments)
      if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
          // Only include image/video attachments inline
          if (attachment.contentType?.startsWith('image/') || attachment.contentType?.startsWith('video/')) {
            files.push(attachment.url);
          }
        }
      }

      // Add embeds from original message (if they contain images)
      if (message.embeds.length > 0) {
        for (const origEmbed of message.embeds) {
          if (origEmbed.image?.url || origEmbed.thumbnail?.url) {
            embeds.push(origEmbed);
          }
        }
      }

      const starboardMessage = await starboardChannel.send({
        content: files.length > 0 ? files.join('\n') : null,
        embeds: embeds,
      });

      // Store entry
      setStarboardEntry(message.guildId, message.id, {
        originalMessageId: message.id,
        originalChannelId: message.channelId,
        originalAuthorId: message.author.id,
        starboardMessageId: starboardMessage.id,
        starCount: starCount,
        createdAt: Date.now(),
      });

      return true;
    } catch (error) {
      console.error('Error posting to starboard:', error);
      return false;
    }
  } catch (error) {
    console.error('handleStarReactionAdd error:', error);
    return false;
  }
}

/**
 * Handle star reaction removed
 */
async function handleStarReactionRemove(reaction, user, client) {
  try {
    // Ignore bot reactions
    if (user.bot) return false;

    // Only handle star emoji
    if (reaction.emoji.name !== '⭐') return false;

    const message = reaction.message;
    
    // Ignore bot messages
    if (message.author.bot) return false;

    // Ignore if no guild
    if (!message.guild) return false;

    // Get starboard config
    const config = getStarboardConfig(message.guildId);
    if (!config.channelId || !config.requiredStars) return false;

    // Get current star count
    const starReaction = message.reactions.cache.get('⭐');
    const starCount = starReaction ? starReaction.count : 0;

    // Check if entry exists
    const entry = getStarboardEntry(message.guildId, message.id);
    if (!entry || !entry.starboardMessageId) return true;

    // If below threshold, remove from starboard
    if (starCount < config.requiredStars) {
      try {
        let starboardChannel;
        try {
          starboardChannel = await client.channels.fetch(config.channelId);
        } catch (error) {
          console.log(`Starboard channel not found when trying to remove entry`);
          removeStarboardEntry(message.guildId, message.id);
          return true;
        }

        if (starboardChannel && starboardChannel.type === ChannelType.GuildText) {
          try {
            const starboardMessage = await starboardChannel.messages.fetch(entry.starboardMessageId);
            if (starboardMessage) {
              await starboardMessage.delete();
            }
          } catch (error) {
            console.log(`Failed to delete starboard message: ${error.message}`);
          }
        }

        removeStarboardEntry(message.guildId, message.id);
        return true;
      } catch (error) {
        console.error('Error removing starboard entry:', error);
      }
    } else {
      // Still above threshold, just update count
      try {
        let starboardChannel;
        try {
          starboardChannel = await client.channels.fetch(config.channelId);
        } catch (error) {
          console.log(`Starboard channel not found when trying to update entry`);
          return true;
        }

        if (starboardChannel && starboardChannel.type === ChannelType.GuildText) {
          const starboardMessage = await starboardChannel.messages.fetch(entry.starboardMessageId);
          if (starboardMessage) {
            const embed = createStarboardEmbed(message, starCount);
            await starboardMessage.edit({ embeds: [embed] });
            // Update star count
            entry.starCount = starCount;
            setStarboardEntry(message.guildId, message.id, entry);
          }
        }
        return true;
      } catch (error) {
        console.log(`Failed to update starboard message on reaction remove: ${error.message}`);
        return true;
      }
    }
  } catch (error) {
    console.error('handleStarReactionRemove error:', error);
    return false;
  }
}

/**
 * Handle deleted message - cleanup starboard entry
 */
async function handleMessageDelete(message, client) {
  try {
    if (!message.guild) return;

    const entry = getStarboardEntry(message.guildId, message.id);
    if (!entry || !entry.starboardMessageId) return;

    // Try to delete from starboard
    try {
      const config = getStarboardConfig(message.guildId);
      if (config.channelId) {
        const starboardChannel = await client.channels.fetch(config.channelId).catch(() => null);
        if (starboardChannel && starboardChannel.type === ChannelType.GuildText) {
          const starboardMessage = await starboardChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
          if (starboardMessage) {
            await starboardMessage.delete().catch(() => {});
          }
        }
      }
    } catch (error) {
      console.log(`Error cleaning up starboard entry: ${error.message}`);
    }

    // Remove entry
    removeStarboardEntry(message.guildId, message.id);
  } catch (error) {
    console.error('handleMessageDelete error:', error);
  }
}

module.exports = {
  createStarboardEmbed,
  handleStarReactionAdd,
  handleStarReactionRemove,
  handleMessageDelete,
};
