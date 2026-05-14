const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for kicking')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }
    
    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'I do not have permission to kick members.')],
        ephemeral: true,
      });
    }
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Check if trying to kick bot
      if (user.id === interaction.client.user.id) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'I cannot kick myself.')],
          ephemeral: true,
        });
      }
      
      // Check hierarchy
      if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'You cannot kick someone with a higher or equal role.')],
          ephemeral: true,
        });
      }
      
      await member.kick(reason);
      
      interaction.reply({
        embeds: [createSuccessEmbed('✅ Kicked', `${user.tag} has been kicked.\n\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Kick command error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while kicking the user.')],
        ephemeral: true,
      });
    }
  },
};
