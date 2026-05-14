const { SlashCommandBuilder, PermissionFlagsBits, time } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('time-out')
    .setDescription('Timeout/mute a member for a specified duration')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to timeout')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('seconds')
        .setDescription('Duration in seconds')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(604800) // 7 days max
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for timeout')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }
    
    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'I do not have permission to timeout members.')],
        ephemeral: true,
      });
    }
    
    const user = interaction.options.getUser('user');
    const seconds = interaction.options.getNumber('seconds');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Check if trying to timeout bot
      if (user.id === interaction.client.user.id) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'I cannot timeout myself.')],
          ephemeral: true,
        });
      }
      
      // Check hierarchy
      if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'You cannot timeout someone with a higher or equal role.')],
          ephemeral: true,
        });
      }
      
      // Apply timeout
      await member.timeout(seconds * 1000, reason);
      
      const timeString = formatTime(seconds);
      
      interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Timed Out',
          `${user.tag} has been timed out for **${timeString}**.\n\n**Reason:** ${reason}`
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Timeout command error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while timing out the user.')],
        ephemeral: true,
      });
    }
  },
};

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ') || '0s';
}
