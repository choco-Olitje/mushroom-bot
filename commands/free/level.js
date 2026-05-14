const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserLevel, getUserXP, getTotalUserXP } = require('../../utils/serverData');
const { createErrorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your level and XP')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check (default: yourself)')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      
      const level = getUserLevel(interaction.guildId, targetUser.id);
      const currentXP = getUserXP(interaction.guildId, targetUser.id);
      const totalXP = getTotalUserXP(interaction.guildId, targetUser.id);
      
      // Calculate required XP for next level
      const requiredForNextLevel = 400 + (level * 100);
      const xpPercentage = Math.floor((currentXP / requiredForNextLevel) * 100);
      
      // Create progress bar
      const filledBars = Math.floor(xpPercentage / 10);
      const emptyBars = 10 - filledBars;
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
      
      const embed = new EmbedBuilder()
        .setColor(0x00AFF4)
        .setTitle(`📊 ${targetUser.username}'s Level`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: 'Level', value: `**${level}**`, inline: true },
          { name: 'Progress to Level ' + (level + 1), value: `**${currentXP}/${requiredForNextLevel}**`, inline: true },
          { name: 'Progress Bar', value: `\`${progressBar}\` ${xpPercentage}%`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Ultimate Discord Bot' });
      
      interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Level command error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while fetching level info.')],
        ephemeral: true,
      });
    }
  },
};
