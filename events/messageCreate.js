const { createSuccessEmbed, createLevelUpEmbed, createErrorEmbed, createEmbed } = require('../utils/embeds');
const { addUserXP, getCountingChannel, getCountingNumber, setCountingNumber, getLastCounter, setLastCounter, getXPMultiplier, getStickyConfig, setStickyConfig, getAllStickyConfigs } = require('../utils/serverData');
const { EmbedBuilder } = require('discord.js');

// Track rate-limited channels to prevent spam
const stickyRateLimits = new Map();
const STICKY_COOLDOWN_MS = 2000; // 2 second cooldown per channel

function createStickyEmbed(title, content) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle(title)
    .setDescription(content)
    .setFooter({ text: 'Pinned by server staff' })
    .setTimestamp();
}

function isStickyEmbedMessage(message, stickyConfig) {
  if (!message?.author?.bot || !message.embeds?.length) return false;

  const embed = message.embeds[0];
  const footerText = embed.footer?.text || '';
  const title = embed.title || '';

  return footerText === 'Pinned by server staff' && title === stickyConfig.title;
}

async function cleanupStickyMessages(channel, stickyConfig) {
  const recentMessages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recentMessages) return;

  for (const [, existingMessage] of recentMessages) {
    if (existingMessage.id === stickyConfig.messageId) continue;
    if (!isStickyEmbedMessage(existingMessage, stickyConfig)) continue;

    await existingMessage.delete().catch(err => {
      console.error(`Failed to delete extra sticky message ${existingMessage.id}:`, err.message);
    });
  }
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    // Ignore bot messages and DMs - THIS MUST BE FIRST
    if (message.author.bot || !message.guild) return;
    
    // Handle sticky messages
    try {
      const stickyConfig = getStickyConfig(message.guildId, message.channelId);
      
      if (stickyConfig) {
        // Check rate limit to prevent spam
        const now = Date.now();
        const channelLimitKey = `${message.guildId}_${message.channelId}`;
        const lastRepost = stickyRateLimits.get(channelLimitKey);
        
        if (!lastRepost || now - lastRepost >= STICKY_COOLDOWN_MS) {
          // Not rate-limited, proceed
          stickyRateLimits.set(channelLimitKey, now);
          
          try {
            await cleanupStickyMessages(message.channel, stickyConfig);

            // Delete old sticky message if it exists
            if (stickyConfig.messageId) {
              try {
                // Try cache first
                let oldMsg = message.channel.messages.cache.get(stickyConfig.messageId);
                
                // If not in cache, fetch it
                if (!oldMsg) {
                  oldMsg = await message.channel.messages.fetch(stickyConfig.messageId).catch(() => null);
                }
                
                // Delete if found
                if (oldMsg) {
                  await oldMsg.delete().catch(err => {
                    if (err?.code !== 10008) {
                      console.error(`Failed to delete sticky message ${stickyConfig.messageId}:`, err.message);
                    }
                  });
                }
              } catch (deleteErr) {
                console.error('Error in sticky deletion process:', deleteErr.message);
              }
            }
            
            // Always post the new sticky message (even if deletion failed)
            const embed = createStickyEmbed(stickyConfig.title, stickyConfig.content);
            const newMsg = await message.channel.send({ embeds: [embed] });
            
            // Update stored message ID
            setStickyConfig(message.guildId, message.channelId, { messageId: newMsg.id });
          } catch (error) {
            console.error('Error reposting sticky message:', error.message);
          }
        }
      }
    } catch (error) {
      console.error('Sticky message error:', error.message);
    }
    
    // Add XP to user
    try {
      const xpGain = Math.floor(Math.random() * 10) + 5; // 5-15 XP per message
      const multiplier = getXPMultiplier(message.guildId);
      const totalXP = xpGain * multiplier;
      
      const result = addUserXP(message.guildId, message.author.id, totalXP);
      
      // Notify on level up
      if (result.leveledUp) {
        const embed = createLevelUpEmbed(message.author.id, result.level, result.totalXP);
        message.reply({ embeds: [embed] }).catch(() => {});
      }
    } catch (error) {
      console.error('XP error:', error);
    }
    
    // Handle counting channel
    try {
      const countingChannel = getCountingChannel(message.guildId);
      
      if (message.channelId === countingChannel) {
        const content = message.content.trim();
        const currentNumber = getCountingNumber(message.guildId);
        const expectedNumber = currentNumber + 1;
        const lastCounter = getLastCounter(message.guildId);
        
        // Check if same user counted twice in a row
        if (message.author.id === lastCounter) {
          await message.react('❌');
          message.reply({
            embeds: [createErrorEmbed(
              '❌ Same User',
              `${message.author.tag}, you cannot count twice in a row! The count has been reset to 0.`
            )],
          }).catch(() => {});
          
          setCountingNumber(message.guildId, 0);
          setLastCounter(message.guildId, null);
          return;
        }
        
        // Check if number is correct
        if (content !== expectedNumber.toString()) {
          await message.react('❌');
          message.reply({
            embeds: [createErrorEmbed(
              '❌ Wrong Number',
              `The correct number is **${expectedNumber}**, not **${content}**. The count has been reset to 0.`
            )],
          }).catch(() => {});
          
          setCountingNumber(message.guildId, 0);
          setLastCounter(message.guildId, null);
          return;
        }
        
        // Correct number
        await message.react('✅');
        setCountingNumber(message.guildId, expectedNumber);
        setLastCounter(message.guildId, message.author.id);
      }
    } catch (error) {
      console.error('Counting error:', error);
    }
  },
};
