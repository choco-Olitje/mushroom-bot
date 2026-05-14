const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const { setStarboardConfig, getStarboardConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-starboard')
    .setDescription('Configure the starboard system for your server')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where starboard messages should be posted')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('required-stars')
        .setDescription('Number of ⭐ reactions required before posting to starboard')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true)
    ),

  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel', true);
    const requiredStars = interaction.options.getInteger('required-stars', true);

    try {
      // Verify bot can send messages in the channel
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      
      if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply({
          embeds: [createErrorEmbed(
            '❌ Missing Permissions',
            `I don't have permission to send messages in ${channel}. Please grant me the Send Messages permission in that channel.`
          )],
          ephemeral: true,
        });
      }

      if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.EmbedLinks)) {
        return interaction.reply({
          embeds: [createErrorEmbed(
            '❌ Missing Permissions',
            `I need the Embed Links permission in ${channel} to post starboard messages.`
          )],
          ephemeral: true,
        });
      }

      // Set the starboard configuration
      setStarboardConfig(interaction.guildId, {
        channelId: channel.id,
        requiredStars: requiredStars,
        configuredBy: interaction.user.id,
        configuredAt: Date.now(),
      });

      const config = getStarboardConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Starboard Configured',
          `**Channel:** ${channel}\n**Required Stars:** ${requiredStars} ⭐\n\nUsers can now react to messages with ⭐ to add them to the starboard!`
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('setup-starboard command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting up the starboard.')],
        ephemeral: true,
      });
    }
  },
};
