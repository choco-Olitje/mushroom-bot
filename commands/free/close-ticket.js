const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embeds');
const {
  getTicketConfig,
  getTicketRecord,
  updateTicketRecord,
  clearOpenTicketChannelForUser,
  hasTicketManagementAccess,
  buildClosedTicketChannelName,
} = require('../../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close the current ticket channel'),

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

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Channels permission to close tickets.')],
        ephemeral: true,
      });
    }

    const closedName = buildClosedTicketChannelName(ticketRecord.ticketNumber);

    try {
      await interaction.channel.setName(closedName);

      await interaction.channel.permissionOverwrites.edit(ticketRecord.creatorId, {
        SendMessages: false,
      }).catch(() => null);

      updateTicketRecord(interaction.guildId, interaction.channelId, {
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: interaction.user.id,
      });

      clearOpenTicketChannelForUser(interaction.guildId, ticketRecord.creatorId);

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Ticket Closed', `The ticket has been renamed to **${closedName}** and the creator can no longer send messages.`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('close-ticket command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while closing the ticket.')],
        ephemeral: true,
      });
    }
  },
};