const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { getXPMultiplier, setXPMultiplier } = require('../../utils/serverData');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exp-multiplier')
    .setDescription('[PREMIUM] Set XP multiplier for your server')
    .addNumberOption(option =>
      option.setName('multiplier')
        .setDescription('XP multiplier (1x - 3x)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(3)
    ),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }
    
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }
    
    const multiplier = interaction.options.getNumber('multiplier');
    
    try {
      setXPMultiplier(interaction.guildId, multiplier);
      
      interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ XP Multiplier Set',
          `XP multiplier has been set to **${multiplier}x**.\n\nMembers will now gain **${multiplier}x** more experience points.`
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Exp-multiplier error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting the multiplier.')],
        ephemeral: true,
      });
    }
  },
};
