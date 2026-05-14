const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createWarningEmbed, createInfoEmbed } = require('../../utils/embeds');
const { getBalance, removeBalance, addBalance, setCooldown, getRemainingCooldown, formatCooldown, flipCoin, acquireLock, releaseLock } = require('../../utils/economy');

const COIN_FLIP_COOLDOWN = 120; // 2 minutes in seconds

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coin-flip')
    .setDescription('[PREMIUM] Bet money on a coin flip (2-minute cooldown)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to bet')
        .setRequired(true)
        .setMinValue(1)
    ),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true
      });
    }
    
    const userId = interaction.user.id;
    const betAmount = interaction.options.getInteger('amount');
    
    // Validation: amount must be positive
    if (betAmount <= 0) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Invalid Bet',
          'Bet amount must be greater than $0!'
        )],
        ephemeral: true
      });
    }
    
    // Check cooldown
    const remainingCooldown = getRemainingCooldown(userId, 'coin-flip');
    if (remainingCooldown) {
      return interaction.reply({
        embeds: [createWarningEmbed(
          '⏱️ Cooldown Active',
          `You can flip again in **${formatCooldown(remainingCooldown)}**.`
        )],
        ephemeral: true
      });
    }
    
    // Acquire lock
    if (!acquireLock(userId)) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '⚠️ Transaction Busy',
          'You have a transaction in progress. Please try again in a moment.'
        )],
        ephemeral: true
      });
    }
    
    try {
      const userBalance = getBalance(userId);
      
      // Validation: user must have enough balance
      if (userBalance < betAmount) {
        return interaction.reply({
          embeds: [createErrorEmbed(
            '❌ Insufficient Balance',
            `You only have **$${userBalance.toLocaleString()}** but tried to bet **$${betAmount.toLocaleString()}**.`
          )],
          ephemeral: true
        });
      }
      
      // Remove bet amount immediately
      removeBalance(userId, betAmount);
      
      // Create buttons
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`heads-${userId}-${betAmount}`)
            .setLabel('🪙 Heads')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`tails-${userId}-${betAmount}`)
            .setLabel('🪙 Tails')
            .setStyle(ButtonStyle.Primary)
        );
      
      // Send embed with buttons
      const embed = createInfoEmbed(
        '🪙 Coin Flip',
        `Choose **Heads** or **Tails** to bet **$${betAmount.toLocaleString()}**!\n\nWin and earn **$${(betAmount * 2).toLocaleString()}** (2x your bet)`
      );
      
      return interaction.reply({
        embeds: [embed],
        components: [buttons],
        ephemeral: false
      });
    } finally {
      releaseLock(userId);
    }
  }
};
