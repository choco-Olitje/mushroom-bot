const { SlashCommandBuilder } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createWarningEmbed } = require('../../utils/embeds');
const { getBalance, addBalance, setCooldown, getRemainingCooldown, formatCooldown, getRandomJob, getRandomEarnings, checkRobbery } = require('../../utils/economy');

const WORK_COOLDOWN = 14400; // 4 hours in seconds

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('[PREMIUM] Work a job to earn money (4-hour cooldown)'),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true
      });
    }
    
    const userId = interaction.user.id;
    
    // Check cooldown
    const remainingCooldown = getRemainingCooldown(userId, 'work');
    if (remainingCooldown) {
      return interaction.reply({
        embeds: [createWarningEmbed(
          '⏱️ Cooldown Active',
          `You can work again in **${formatCooldown(remainingCooldown)}**.`
        )],
        ephemeral: true
      });
    }
    
    // Set cooldown
    setCooldown(userId, 'work', WORK_COOLDOWN);
    
    // Random job and earnings
    const job = getRandomJob();
    const earnings = getRandomEarnings();
    const robbed = checkRobbery();
    
    let embed;
    
    if (robbed) {
      embed = createWarningEmbed(
        '💼 Got Robbed!',
        `You worked as a **${job.name}** ${job.emoji} but got robbed while leaving work!\n\nYou earned: **$0**`
      );
    } else {
      addBalance(userId, earnings);
      embed = createSuccessEmbed(
        '💼 Work Completed',
        `You worked as a **${job.name}** ${job.emoji} and earned **$${earnings.toLocaleString()}**!\n\nNew balance: **$${getBalance(userId).toLocaleString()}**`
      );
    }
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
