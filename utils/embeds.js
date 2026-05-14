const { EmbedBuilder } = require('discord.js');

// Create embed template
function createEmbed(title, description, color = 0x00AFF4) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Ultimate Discord Bot' });
}

// Create error embed
function createErrorEmbed(title, description) {
  return createEmbed(title, description, 0xFF0000);
}

// Create success embed
function createSuccessEmbed(title, description) {
  return createEmbed(title, description, 0x00FF00);
}

// Create warning embed
function createWarningEmbed(title, description) {
  return createEmbed(title, description, 0xFFFF00);
}

// Create info embed
function createInfoEmbed(title, description) {
  return createEmbed(title, description, 0x0099FF);
}

// Create premium required embed
function createPremiumRequiredEmbed() {
  return createErrorEmbed(
    '❌ Premium Required',
    'This command is only available for premium servers.\n\nUse `/subscription buy` to upgrade your server!'
  );
}

// Create permission denied embed
function createPermissionDeniedEmbed() {
  return createErrorEmbed(
    '❌ Permission Denied',
    'You do not have permission to use this command.'
  );
}

// Create cooldown embed
function createCooldownEmbed(seconds) {
  return createWarningEmbed(
    '⏱️ Cooldown',
    `Please wait ${seconds} seconds before using this command again.`
  );
}

// Create level up embed
function createLevelUpEmbed(userId, newLevel, totalXP) {
  return createSuccessEmbed(
    '🎉 Level Up!',
    `<@${userId}> has reached **Level ${newLevel}**!\n\nTotal XP: ${totalXP}`
  );
}

// Create music queue embed
function createQueueEmbed(queue) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🎵 Music Queue')
    .setTimestamp()
    .setFooter({ text: 'Ultimate Discord Bot' });
  
  if (queue.length === 0) {
    embed.setDescription('The queue is currently empty.');
  } else {
    let description = '';
    queue.slice(0, 10).forEach((song, index) => {
      description += `${index + 1}. [${song.title}](${song.url})\n`;
    });
    
    if (queue.length > 10) {
      description += `\n*... and ${queue.length - 10} more songs*`;
    }
    
    embed.setDescription(description);
  }
  
  return embed;
}

module.exports = {
  createEmbed,
  createErrorEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createInfoEmbed,
  createPremiumRequiredEmbed,
  createPermissionDeniedEmbed,
  createCooldownEmbed,
  createLevelUpEmbed,
  createQueueEmbed,
};
