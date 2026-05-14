const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for banning')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }
    
    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'I do not have permission to ban members.')],
        ephemeral: true,
      });
    }
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Check if trying to ban bot
      if (user.id === interaction.client.user.id) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'I cannot ban myself.')],
          ephemeral: true,
        });
      }
      
      // Check hierarchy
      if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'You cannot ban someone with a higher or equal role.')],
          ephemeral: true,
        });
      }
      
      await interaction.guild.members.ban(user, { reason });
      
      interaction.reply({
        embeds: [createSuccessEmbed('✅ Banned', `${user.tag} has been banned.\n\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Ban command error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while banning the user.')],
        ephemeral: true,
      });
    }
  },
};
