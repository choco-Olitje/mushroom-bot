const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embeds');
const {
  getTicketConfig,
  getTicketRecord,
  updateTicketRecord,
  hasTicketManagementAccess,
  buildDeletedTicketChannelName,
  clearOpenTicketForChannel,
} = require('../../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete-ticket')
    .setDescription('Rename and delete the current ticket channel'),

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
        embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Channels permission to delete tickets.')],
        ephemeral: true,
      });
    }

    const deletedName = buildDeletedTicketChannelName(ticketRecord.ticketNumber);

    try {
      await interaction.channel.setName(deletedName).catch(() => null);

      updateTicketRecord(interaction.guildId, interaction.channelId, {
        status: 'deleted',
        deletedAt: new Date().toISOString(),
        deletedBy: interaction.user.id,
      });

      clearOpenTicketForChannel(interaction.guildId, interaction.channelId);

      await interaction.reply({
        embeds: [createSuccessEmbed('✅ Ticket Deletion Scheduled', 'The ticket will be deleted in 3 seconds.')],
        ephemeral: true,
      });

      setTimeout(() => {
        interaction.channel.delete(`Deleted by ${interaction.user.tag}`).catch(error => {
          console.error('delete-ticket channel delete error:', error);
        });
      }, 3000);
    } catch (error) {
      console.error('delete-ticket command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while deleting the ticket.')],
        ephemeral: true,
      });
    }
  },
};