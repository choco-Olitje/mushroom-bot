const crypto = require('crypto');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { createErrorEmbed, createPermissionDeniedEmbed, createSuccessEmbed } = require('../../utils/embeds');
const {
  parseDurationInput,
  saveGiveawayRecord,
  deleteGiveawayRecord,
  patchGiveawayRecord,
  buildGiveawayEmbed,
  buildGiveawayComponents,
  scheduleGiveawayEnd,
} = require('../../utils/giveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-giveaway')
    .setDescription('Create a timed giveaway with entry buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('duration')
        .setDescription('How long the giveaway should run, for example: 30 minutes or 2 hours')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('winners')
        .setDescription('The number of winners')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('prize')
        .setDescription('The giveaway prize or title')
        .setMaxLength(256)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel where the giveaway should be posted')
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.AnnouncementThread,
          ChannelType.PrivateThread,
        )
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('host')
        .setDescription('The host user to display on the giveaway')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('required-role')
        .setDescription('A role required to enter the giveaway')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const durationInput = interaction.options.getString('duration', true);
    const winners = interaction.options.getInteger('winners', true);
    const prize = interaction.options.getString('prize', true).trim();
    const selectedChannel = interaction.options.getChannel('channel') || interaction.channel;
    const host = interaction.options.getUser('host');
    const requiredRole = interaction.options.getRole('required-role');

    const parsedDuration = parseDurationInput(durationInput);

    if (!parsedDuration) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Duration', 'Use a valid duration like `30 minutes`, `2 hours`, or `3 days`.')],
        ephemeral: true,
      });
    }

    if (!selectedChannel || !selectedChannel.isTextBased()) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Invalid Channel', 'Please choose a text-based channel for the giveaway.')],
        ephemeral: true,
      });
    }

    try {
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      const targetPermissions = selectedChannel.permissionsFor(botMember);

      if (!targetPermissions || !targetPermissions.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ])) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', `I need View Channel, Send Messages, Embed Links, and Read Message History in ${selectedChannel}.`)],
          ephemeral: true,
        });
      }

      const giveawayId = crypto.randomUUID();
      const giveawayRecord = saveGiveawayRecord(interaction.guildId, {
        giveawayId,
        messageId: null,
        channelId: selectedChannel.id,
        prize,
        winnerCount: winners,
        hostId: host?.id || null,
        requiredRoleId: requiredRole?.id || null,
        endAt: parsedDuration.endAt,
        entries: [],
        ended: false,
        endedAt: null,
        winners: [],
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id,
      });

      try {
        const giveawayMessage = await selectedChannel.send({
          embeds: [buildGiveawayEmbed(giveawayRecord)],
          components: buildGiveawayComponents(giveawayId),
          allowedMentions: { parse: [] },
        });

        patchGiveawayRecord(interaction.guildId, giveawayId, {
          messageId: giveawayMessage.id,
        });

        scheduleGiveawayEnd(interaction.client, interaction.guildId, giveawayId, parsedDuration.endAt);
      } catch (sendError) {
        deleteGiveawayRecord(interaction.guildId, giveawayId);
        throw sendError;
      }

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            '✅ Giveaway Created',
            `Your giveaway has been posted in ${selectedChannel}.\n\n**Prize:** ${prize}\n**Ends:** <t:${Math.floor(parsedDuration.endAt / 1000)}:R>`
          ),
        ],
        ephemeral: true,
      });
    } catch (error) {
      console.error('create-giveaway command error:', error);

      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while creating the giveaway.')],
        ephemeral: true,
      });
    }
  },
};