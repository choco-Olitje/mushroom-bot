const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { buildAutomodPanel } = require('../../utils/automod-ui');
const {
  createPremiumRequiredEmbed,
  createPermissionDeniedEmbed,
} = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-automod')
    .setDescription('[PREMIUM] Open the interactive automod setup panel'),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }

    const { embed, components } = buildAutomodPanel(interaction.guildId);
    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  },
};
