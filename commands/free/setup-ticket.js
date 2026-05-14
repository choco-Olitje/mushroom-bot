const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const {
  DEFAULT_TICKET_BUTTON_TEXT,
  getTicketConfig,
  setTicketConfig,
  parseSupportRoleIds,
  createTicketPanelEmbed,
} = require('../../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-ticket')
    .setDescription('Configure the server ticket system')
    .addStringOption(option =>
      option
        .setName('ticket-name')
        .setDescription('The name/title of the ticket system')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('category')
        .setDescription('The category where ticket channels will be created')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('panel-channel')
        .setDescription('The channel where the ticket panel message will be sent')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('support-roles')
        .setDescription('Mention one or more support roles, separated by commas')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('transcript-channel')
        .setDescription('The channel where ticket transcripts should be sent')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('button-text')
        .setDescription('Custom text for the ticket button')
        .setRequired(false)
    )
    ,

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const ticketName = interaction.options.getString('ticket-name', true).trim();
    const category = interaction.options.getChannel('category', true);
    const panelChannel = interaction.options.getChannel('panel-channel', true);
    const transcriptChannel = interaction.options.getChannel('transcript-channel', false);
    const buttonText = interaction.options.getString('button-text', false)?.trim() || DEFAULT_TICKET_BUTTON_TEXT;
    const supportRolesInput = interaction.options.getString('support-roles', true);

    if (ticketName.length > 256) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Ticket Name', 'The ticket system name must be 256 characters or fewer.')],
        ephemeral: true,
      });
    }

    if (buttonText.length > 80) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Button Text', 'The ticket button text must be 80 characters or fewer.')],
        ephemeral: true,
      });
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Channels permission to configure tickets.')],
        ephemeral: true,
      });
    }

    if (!panelChannel.permissionsFor(botMember).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Missing Permissions', `I need to be able to view and post embeds in ${panelChannel}.`)],
        ephemeral: true,
      });
    }

    const supportRoleIds = await parseSupportRoleIds(interaction.guild, supportRolesInput);

    if (supportRoleIds.length === 0) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Support Roles', 'Please provide at least one valid support role mention or role ID.')],
        ephemeral: true,
      });
    }

    const existingConfig = getTicketConfig(interaction.guildId);
    const updatedConfig = setTicketConfig(interaction.guildId, {
      ticketName,
      categoryId: category.id,
      panelChannelId: panelChannel.id,
      transcriptChannelId: transcriptChannel?.id || null,
      buttonText,
      supportRoleIds,
      nextTicketNumber: existingConfig.nextTicketNumber,
      tickets: existingConfig.tickets,
      openTicketsByUser: existingConfig.openTicketsByUser,
      panelMessageId: existingConfig.panelMessageId || null,
    });

    const button = new ButtonBuilder()
      .setCustomId(`ticket-open-${interaction.guildId}`)
      .setLabel(buttonText)
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    const panelEmbed = createTicketPanelEmbed(ticketName);

    try {
      if (existingConfig.panelMessageId && existingConfig.panelChannelId) {
        const previousPanelChannel = interaction.guild.channels.cache.get(existingConfig.panelChannelId)
          || await interaction.guild.channels.fetch(existingConfig.panelChannelId).catch(() => null);

        if (previousPanelChannel) {
          const previousPanelMessage = await previousPanelChannel.messages.fetch(existingConfig.panelMessageId).catch(() => null);
          if (previousPanelMessage) {
            await previousPanelMessage.delete().catch(() => null);
          }
        }
      }

      const panelMessage = await panelChannel.send({
        embeds: [panelEmbed],
        components: [row],
      });

      setTicketConfig(interaction.guildId, {
        ...updatedConfig,
        panelMessageId: panelMessage.id,
      });

      const transcriptText = transcriptChannel ? `${transcriptChannel}` : 'Not configured';

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            '✅ Ticket System Configured',
            [
              `**Ticket Name:** ${ticketName}`,
              `**Category:** ${category}`,
              `**Panel Channel:** ${panelChannel}`,
              `**Transcript Channel:** ${transcriptText}`,
              `**Button Text:** ${buttonText}`,
              `**Support Roles:** ${supportRoleIds.map(roleId => `<@&${roleId}>`).join(', ')}`,
            ].join('\n'),
          ),
        ],
        ephemeral: true,
      });
    } catch (error) {
      console.error('setup-ticket command error:', error);

      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'I could not send the ticket panel message. Please check my permissions in the selected panel channel.')],
        ephemeral: true,
      });
    }
  },
};