const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed, createWarningEmbed } = require('../../utils/embeds');
const { removeStarboardConfig, getStarboardConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete-starboard')
    .setDescription('Disable the starboard system for your server'),

  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    try {
      // Check if starboard is configured
      const config = getStarboardConfig(interaction.guildId);
      if (!config.channelId || !config.requiredStars) {
        return interaction.reply({
          embeds: [createWarningEmbed(
            '⚠️ No Starboard',
            'The starboard is not currently configured. Use `/setup-starboard` to set it up.'
          )],
          ephemeral: true,
        });
      }

      // Remove configuration
      removeStarboardConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Starboard Disabled',
          'The starboard system has been disabled for this server. Star reactions will no longer be tracked.\n\n**Note:** Existing starboard posts remain in the starboard channel, but new ones won\'t be added.'
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('delete-starboard command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while disabling the starboard.')],
        ephemeral: true,
      });
    }
  },
};
