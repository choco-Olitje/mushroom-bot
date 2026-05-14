const { SlashCommandBuilder } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createInfoEmbed } = require('../../utils/embeds');
const { getBalance } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('[PREMIUM] Check your current balance')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check balance for (defaults to you)')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true
      });
    }
    
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const balance = getBalance(targetUser.id);
    
    const embed = createInfoEmbed(
      '💰 Balance',
      `<@${targetUser.id}>'s current balance: **$${balance.toLocaleString()}**`
    );
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
