const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { setBirthdayConfig, getBirthdayConfig } = require('../../utils/serverData');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday-setup')
    .setDescription('Configure birthday announcements and role')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel for birthday announcements')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Role to grant on birthday (removed after 24h)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Admin only
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createPermissionDeniedEmbed()], ephemeral: true });
    }

    try {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      const config = {};
      if (channel) config.channelId = channel.id;
      if (role) config.roleId = role.id;

      setBirthdayConfig(interaction.guildId, config);

      const finalConfig = getBirthdayConfig(interaction.guildId);

      let desc = '';
      desc += finalConfig.channelId ? `Announcements: <#${finalConfig.channelId}>\n` : 'Announcements: Not set\n';
      desc += finalConfig.roleId ? `Birthday Role: <@&${finalConfig.roleId}>` : 'Birthday Role: Not set';

      interaction.reply({ embeds: [createSuccessEmbed('✅ Birthday Setup Updated', desc)], ephemeral: true });
    } catch (error) {
      console.error('Birthday-setup command error:', error);
      interaction.reply({ embeds: [createErrorEmbed('❌ Error', 'An error occurred while updating birthday settings.')], ephemeral: true });
    }
  },
};
