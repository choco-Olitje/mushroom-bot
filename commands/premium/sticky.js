const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const { isPremium } = require('../../utils/premium');
const {
  getStickyConfig,
  setStickyConfig,
  removeStickyConfig,
} = require('../../utils/serverData');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed, createPremiumRequiredEmbed } = require('../../utils/embeds');

function createStickyEmbed(title, content) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle(title)
    .setDescription(content)
    .setFooter({ text: 'Pinned by server staff' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Create or manage sticky messages in a channel (Premium only)')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new sticky message')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel for the sticky message')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a sticky message from a channel')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel with the sticky message')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('update')
        .setDescription('Update an existing sticky message')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel with the sticky message to update')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all sticky messages in this server')
    ),

  async execute(interaction) {
    // Check admin permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      return handleCreate(interaction);
    } else if (subcommand === 'remove') {
      return handleRemove(interaction);
    } else if (subcommand === 'update') {
      return handleUpdate(interaction);
    } else if (subcommand === 'list') {
      return handleList(interaction);
    }
  },
};

async function handleCreate(interaction) {
  const channel = interaction.options.getChannel('channel');

  // Check if bot can send messages in channel
  const botMember = await interaction.guild.members.fetchMe();
  if (!channel.permissionsFor(botMember).has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Permission Denied', `I don't have permission to send messages in ${channel}.`)],
      ephemeral: true,
    });
  }

  // Check if sticky already exists
  const existing = getStickyConfig(interaction.guildId, channel.id);
  if (existing) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Already Exists', `${channel} already has a sticky message. Use \`/sticky update\` or \`/sticky remove\` first.`)],
      ephemeral: true,
    });
  }

  // Show modal
  const modal = new ModalBuilder()
    .setCustomId(`sticky_create_${channel.id}_${interaction.guildId}`)
    .setTitle('Create Sticky Message');

  const titleInput = new TextInputBuilder()
    .setCustomId('sticky_title')
    .setLabel('Sticky Title')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(true);

  const contentInput = new TextInputBuilder()
    .setCustomId('sticky_content')
    .setLabel('Sticky Message Content')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput)
  );

  await interaction.showModal(modal);
}

async function handleRemove(interaction) {
  const channel = interaction.options.getChannel('channel');
  const config = getStickyConfig(interaction.guildId, channel.id);

  if (!config) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Not Found', `${channel} does not have a sticky message.`)],
      ephemeral: true,
    });
  }

  // Delete old sticky message
  if (config.messageId) {
    try {
      const msg = await channel.messages.fetch(config.messageId);
      await msg.delete();
    } catch (e) {
      // message already deleted, that's fine
    }
  }

  removeStickyConfig(interaction.guildId, channel.id);

  interaction.reply({
    embeds: [createSuccessEmbed('✅ Sticky Removed', `Sticky message removed from ${channel}.`)],
    ephemeral: true,
  });
}

async function handleUpdate(interaction) {
  const channel = interaction.options.getChannel('channel');
  const config = getStickyConfig(interaction.guildId, channel.id);

  if (!config) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Not Found', `${channel} does not have a sticky message.`)],
      ephemeral: true,
    });
  }

  // Show modal with current values
  const modal = new ModalBuilder()
    .setCustomId(`sticky_update_${channel.id}_${interaction.guildId}`)
    .setTitle('Update Sticky Message');

  const titleInput = new TextInputBuilder()
    .setCustomId('sticky_title')
    .setLabel('Sticky Title')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setValue(config.title || '')
    .setRequired(true);

  const contentInput = new TextInputBuilder()
    .setCustomId('sticky_content')
    .setLabel('Sticky Message Content')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setValue(config.content || '')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput)
  );

  await interaction.showModal(modal);
}

function handleList(interaction) {
  const { getAllStickyConfigs } = require('../../utils/serverData');
  const configs = getAllStickyConfigs(interaction.guildId);

  if (Object.keys(configs).length === 0) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ No Stickies', 'This server has no sticky messages.')],
      ephemeral: true,
    });
  }

  let desc = '';
  for (const [channelId, cfg] of Object.entries(configs)) {
    desc += `<#${channelId}>: ${cfg.title || 'Untitled'}\n`;
  }

  interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00AFF4)
        .setTitle('📌 Sticky Messages')
        .setDescription(desc)
        .setFooter({ text: 'Ultimate Discord Bot' })
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}
