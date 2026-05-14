const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { setCountingChannel } = require('../../utils/serverData');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-counter')
    .setDescription('Set a text channel as the counting channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The text channel for counting')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),
  
  async execute(interaction) {
    // Check if user is admin
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }
    
    const channel = interaction.options.getChannel('channel');
    
    try {
      setCountingChannel(interaction.guildId, channel.id);
      
      interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Counting Channel Set',
          `${channel} has been set as the counting channel.\n\n**Rules:**\n• Count upward (1, 2, 3...)\n• Same user cannot count twice in a row\n• Wrong number resets to 0`
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Set-counter command error:', error);
      interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting the counting channel.')],
        ephemeral: true,
      });
    }
  },
};
