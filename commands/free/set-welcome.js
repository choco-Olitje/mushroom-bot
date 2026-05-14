const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const { setWelcomeConfig, getWelcomeConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-welcome')
    .setDescription('Set the channel used for welcome messages')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where welcome messages should be sent')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel', true);

    try {
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

      if (!channel.permissionsFor(botMember).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', `I need access to ${channel} to send welcome messages.`)],
          ephemeral: true,
        });
      }

      setWelcomeConfig(interaction.guildId, { channelId: channel.id });
      const config = getWelcomeConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Welcome Channel Set', `Welcome messages will now be sent in ${channel}.\n\n**Channel:** <#${config.channelId}>`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('set-welcome command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting the welcome channel.')],
        ephemeral: true,
      });
    }
  },
};