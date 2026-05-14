const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embeds');
const {
  getTicketConfig,
  getTicketRecord,
  hasTicketManagementAccess,
  buildTranscriptAttachment,
} = require('../../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript-ticket')
    .setDescription('Send a transcript of the current ticket to the configured transcript channel'),

  async execute(interaction) {
    const ticketRecord = getTicketRecord(interaction.guildId, interaction.channelId);

    if (!ticketRecord) {
      return interaction.reply({
        content: 'Error: this is not a ticket channel.',
        ephemeral: true,
      });
    }

    const ticketConfig = getTicketConfig(interaction.guildId);

    if (!hasTicketManagementAccess(interaction.member, ticketConfig.supportRoleIds)) {
      return interaction.reply({
        content: 'Error: you do not have permission to use this command.',
        ephemeral: true,
      });
    }

    if (!ticketConfig.transcriptChannelId) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Transcript Channel Missing', 'No transcript channel has been configured for this server.')],
        ephemeral: true,
      });
    }

    const transcriptChannel = interaction.guild.channels.cache.get(ticketConfig.transcriptChannelId)
      || await interaction.guild.channels.fetch(ticketConfig.transcriptChannelId).catch(() => null);

    if (!transcriptChannel) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Transcript Channel Missing', 'The configured transcript channel no longer exists.')],
        ephemeral: true,
      });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

    if (!transcriptChannel.permissionsFor(botMember).has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Missing Permissions', `I need access to ${transcriptChannel} to send transcripts.`)],
        ephemeral: true,
      });
    }

    try {
      const attachment = await buildTranscriptAttachment(interaction.channel, ticketRecord);

      await transcriptChannel.send({
        content: `Transcript for ${interaction.channel} | Creator: <@${ticketRecord.creatorId}>`,
        files: [attachment],
      });

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Transcript Sent', `The transcript has been sent to ${transcriptChannel}.`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('transcript-ticket command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while generating the transcript.')],
        ephemeral: true,
      });
    }
  },
};