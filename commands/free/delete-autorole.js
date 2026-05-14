const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const { getAutoRoleConfig, removeAutoRoleConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete-autorole')
    .setDescription('Disable automatic role assignment for new members'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    try {
      const config = getAutoRoleConfig(interaction.guildId);

      if (!config.roleId) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Auto-Role Not Set', 'Auto-role is not configured for this server.')],
          ephemeral: true,
        });
      }

      removeAutoRoleConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Auto-Role Disabled', 'Automatic role assignment has been disabled for this server.')],
        ephemeral: true,
      });
    } catch (error) {
      console.error('delete-autorole command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while disabling auto-role.')],
        ephemeral: true,
      });
    }
  },
};