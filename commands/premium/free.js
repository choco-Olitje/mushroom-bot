const { SlashCommandBuilder } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed } = require('../../utils/embeds');
const { getBalance, hasClaimedFree, markFreeClaimed, addBalance } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('free')
    .setDescription('[PREMIUM] Claim your one-time free $200 starter cash'),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true
      });
    }
    
    const userId = interaction.user.id;
    
    // Check if already claimed
    if (hasClaimedFree(userId)) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Already Claimed',
          'You already claimed your free cash. You can only use this once!'
        )],
        ephemeral: true
      });
    }
    
    // Add balance and mark as claimed
    const FREE_AMOUNT = 200;
    addBalance(userId, FREE_AMOUNT);
    markFreeClaimed(userId);
    
    const embed = createSuccessEmbed(
      '🎉 Free Cash Claimed',
      `You claimed your one-time free **$${FREE_AMOUNT}**!\n\nNew balance: **$${getBalance(userId).toLocaleString()}**`
    );
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
