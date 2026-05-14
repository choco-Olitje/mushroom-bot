const { SlashCommandBuilder } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed } = require('../../utils/embeds');
const { getBalance, removeBalance, addBalance, acquireLock, releaseLock } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give-money')
    .setDescription('[PREMIUM] Send money to another user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to send money to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount of money to send')
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
    
    const sender = interaction.user;
    const receiver = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    
    // Validation: cannot send to self
    if (sender.id === receiver.id) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Invalid Transfer',
          'You cannot send money to yourself!'
        )],
        ephemeral: true
      });
    }
    
    // Validation: cannot send to bot
    if (receiver.bot) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Invalid Transfer',
          'You cannot send money to a bot!'
        )],
        ephemeral: true
      });
    }
    
    // Validation: amount must be positive
    if (amount <= 0) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Invalid Amount',
          'Amount must be greater than $0!'
        )],
        ephemeral: true
      });
    }
    
    // Acquire lock to prevent race conditions
    if (!acquireLock(sender.id)) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '⚠️ Transaction Busy',
          'You have a transaction in progress. Please try again in a moment.'
        )],
        ephemeral: true
      });
    }
    
    try {
      const senderBalance = getBalance(sender.id);
      
      // Validation: sender must have enough balance
      if (senderBalance < amount) {
        return interaction.reply({
          embeds: [createErrorEmbed(
            '❌ Insufficient Balance',
            `You only have **$${senderBalance.toLocaleString()}** but tried to send **$${amount.toLocaleString()}**.`
          )],
          ephemeral: true
        });
      }
      
      // Execute transaction
      removeBalance(sender.id, amount);
      addBalance(receiver.id, amount);
      
      const embed = createSuccessEmbed(
        '💸 Money Sent',
        `You sent **$${amount.toLocaleString()}** to <@${receiver.id}>!\n\nYour new balance: **$${getBalance(sender.id).toLocaleString()}**`
      );
      
      return interaction.reply({
        embeds: [embed],
        ephemeral: false
      });
    } finally {
      releaseLock(sender.id);
    }
  }
};
