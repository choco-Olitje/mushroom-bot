const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const { getWelcomeConfig, removeWelcomeConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete-welcome')
    .setDescription('Disable welcome messages for this server'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    try {
      const config = getWelcomeConfig(interaction.guildId);

      if (!config.channelId) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Welcome Not Set', 'Welcome messages are not configured for this server.')],
          ephemeral: true,
        });
      }

      removeWelcomeConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Welcome Disabled', 'Welcome messages have been disabled for this server.')],
        ephemeral: true,
      });
    } catch (error) {
      console.error('delete-welcome command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while disabling welcome messages.')],
        ephemeral: true,
      });
    }
  },
};