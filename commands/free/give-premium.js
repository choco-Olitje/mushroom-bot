const { SlashCommandBuilder } = require('discord.js');
const { grantPremiumMonths, getPremiumStatus } = require('../../utils/premium');
const { createErrorEmbed, createSuccessEmbed } = require('../../utils/embeds');

const OWNER_ID = '763492125626728489';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give-premium')
    .setDescription('Grant premium to a server (owner only)')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option
        .setName('server_id')
        .setDescription('The Discord server/guild ID')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('months')
        .setDescription('Number of premium months to grant')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(12)
    ),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Permission Denied', 'This command is restricted to the bot owner.')],
        ephemeral: true,
      });
    }

    const serverId = interaction.options.getString('server_id', true).trim();
    const months = interaction.options.getInteger('months', true);

    if (!/^\d{17,19}$/.test(serverId)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Server ID', 'Please provide a valid Discord server ID.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = await interaction.client.guilds.fetch(serverId).catch(() => null);

      if (!guild) {
        return interaction.editReply({
          embeds: [createErrorEmbed('❌ Server Not Found', 'The bot is not in that server.')],
        });
      }

      const existingPremium = getPremiumStatus(serverId);
      const updatedPremium = grantPremiumMonths(serverId, months, {
        premium: true,
        grantedBy: interaction.user.id,
        grantedAt: new Date().toISOString(),
        grantType: 'manual',
      });

      const expiryDate = new Date(updatedPremium.expiresAt || existingPremium.expiresAt);
      const verb = existingPremium.premium ? 'extended' : 'activated';

      return interaction.editReply({
        embeds: [createSuccessEmbed(
          '✅ Premium Updated',
          `Premium ${verb} for **${months} month${months === 1 ? '' : 's'}** in server **${guild.name}** (${serverId}).\n\nExpires: **${expiryDate.toUTCString()}**`
        )],
      });
    } catch (error) {
      console.error('Give premium error:', error);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          embeds: [createErrorEmbed('❌ Error', 'An error occurred while granting premium.')],
        });
      }

      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while granting premium.')],
        ephemeral: true,
      });
    }
  },
};