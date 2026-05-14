const path = require('path');
const fs = require('fs');
const { createErrorEmbed, createCooldownEmbed, createSuccessEmbed } = require('../utils/embeds');
const { getCooldown, setCooldown } = require('../utils/cooldown');
const { setStickyConfig, getStickyConfig } = require('../utils/serverData');
const {
  EmbedBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  getTicketConfig,
  getOpenTicketChannelIdForUser,
  clearOpenTicketChannelForUser,
  setOpenTicketChannelForUser,
  setTicketRecord,
  allocateTicketNumber,
  buildTicketChannelName,
  createTicketIssueEmbed,
  createTicketStaffCommandsEmbed,
} = require('../utils/tickets');
const { handleGiveawayButtonInteraction } = require('../utils/giveaways');
const { handleCoinFlipButton } = require('../utils/economy');

function createStickyEmbed(title, content) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle(title)
    .setDescription(content)
    .setFooter({ text: 'Pinned by server staff' })
    .setTimestamp();
}

async function handleStickyModal(interaction) {
  const parts = interaction.customId.split('_');
  const isUpdate = parts[1] === 'update';
  const channelId = parts[isUpdate ? 3 : 2];
  const guildId = parts[isUpdate ? 4 : 3];

  if (guildId !== interaction.guildId) return true;

  try {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'Channel not found.')],
      });
      return true;
    }

    const title = interaction.fields.getTextInputValue('sticky_title');
    const content = interaction.fields.getTextInputValue('sticky_content');

    const oldConfig = isUpdate ? getStickyConfig(guildId, channelId) : null;
    if (oldConfig && oldConfig.messageId) {
      try {
        let oldMsg = channel.messages.cache.get(oldConfig.messageId);
        if (!oldMsg) {
          oldMsg = await channel.messages.fetch(oldConfig.messageId).catch(() => null);
        }
        if (oldMsg) {
          await oldMsg.delete().catch(error => {
            if (error?.code !== 10008) {
              console.error('Failed to delete old sticky:', error.message);
            }
          });
        }
      } catch (error) {
        console.error('Sticky cleanup error:', error.message);
      }
    }

    const embed = createStickyEmbed(title, content);
    const message = await channel.send({ embeds: [embed] });

    setStickyConfig(guildId, channelId, {
      title,
      content,
      messageId: message.id,
    });

    const actionText = isUpdate ? 'Updated' : 'Created';
    await interaction.editReply({
      embeds: [createSuccessEmbed(`✅ Sticky ${actionText}`, `Sticky message has been ${actionText.toLowerCase()} in ${channel}.`)],
    });

    return true;
  } catch (error) {
    console.error('Error creating/updating sticky:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'Failed to post sticky message.')],
      });
    } else {
      await interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'Failed to post sticky message.')],
        ephemeral: true,
      });
    }
    return true;
  }
}

async function handleTicketButton(interaction) {
  const guildId = interaction.customId.split('-').pop();

  if (guildId !== interaction.guildId) return true;

  try {
    const ticketConfig = getTicketConfig(guildId);

    if (!ticketConfig.ticketName || !ticketConfig.categoryId || !ticketConfig.panelChannelId) {
      await interaction.reply({
        embeds: [createErrorEmbed('❌ Ticket System Missing', 'The ticket system has not been configured for this server.')],
        ephemeral: true,
      });
      return true;
    }

    const existingOpenChannelId = getOpenTicketChannelIdForUser(guildId, interaction.user.id);
    if (existingOpenChannelId) {
      const existingOpenChannel = interaction.guild.channels.cache.get(existingOpenChannelId)
        || await interaction.guild.channels.fetch(existingOpenChannelId).catch(() => null);

      if (existingOpenChannel) {
        await interaction.reply({
          embeds: [createErrorEmbed('❌ Open Ticket Exists', `You already have an open ticket: ${existingOpenChannel}. Please close or delete it first.`)],
          ephemeral: true,
        });
        return true;
      }

      clearOpenTicketChannelForUser(guildId, interaction.user.id);
    }

    const category = interaction.guild.channels.cache.get(ticketConfig.categoryId)
      || await interaction.guild.channels.fetch(ticketConfig.categoryId).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.reply({
        embeds: [createErrorEmbed('❌ Category Missing', 'The configured ticket category no longer exists.')],
        ephemeral: true,
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`ticket_create_${interaction.guildId}`)
      .setTitle('Create Ticket');

    const issueTitleInput = new TextInputBuilder()
      .setCustomId('ticket_issue_title')
      .setLabel('Issue Title')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const issueDescriptionInput = new TextInputBuilder()
      .setCustomId('ticket_issue_description')
      .setLabel('Issue Description')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(issueTitleInput),
      new ActionRowBuilder().addComponents(issueDescriptionInput),
    );

    await interaction.showModal(modal);
    return true;
  } catch (error) {
    console.error('Ticket button error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while opening the ticket form.')],
        ephemeral: true,
      });
    }
    return true;
  }
}

async function handleTicketModal(interaction) {
  const guildId = interaction.customId.split('_')[2];

  if (guildId !== interaction.guildId) return true;

  try {
    await interaction.deferReply({ ephemeral: true });

    const ticketConfig = getTicketConfig(guildId);

    if (!ticketConfig.ticketName || !ticketConfig.categoryId || !ticketConfig.panelChannelId) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Ticket System Missing', 'The ticket system has not been configured for this server.')],
      });
      return true;
    }

    const existingOpenChannelId = getOpenTicketChannelIdForUser(guildId, interaction.user.id);
    if (existingOpenChannelId) {
      const existingOpenChannel = interaction.guild.channels.cache.get(existingOpenChannelId)
        || await interaction.guild.channels.fetch(existingOpenChannelId).catch(() => null);

      if (existingOpenChannel) {
        await interaction.editReply({
          embeds: [createErrorEmbed('❌ Open Ticket Exists', `You already have an open ticket: ${existingOpenChannel}. Please close or delete it first.`)],
        });
        return true;
      }

      clearOpenTicketChannelForUser(guildId, interaction.user.id);
    }

    const category = interaction.guild.channels.cache.get(ticketConfig.categoryId)
      || await interaction.guild.channels.fetch(ticketConfig.categoryId).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Category Missing', 'The configured ticket category no longer exists.')],
      });
      return true;
    }

    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Channels permission to create tickets.')],
      });
      return true;
    }

    const issueTitle = interaction.fields.getTextInputValue('ticket_issue_title');
    const issueDescription = interaction.fields.getTextInputValue('ticket_issue_description');
    const ticketNumber = allocateTicketNumber(guildId);
    const supportRoleIds = ticketConfig.supportRoleIds.filter(Boolean);

    const createdChannel = await interaction.guild.channels.create({
      name: buildTicketChannelName(ticketNumber),
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket #${String(ticketNumber).padStart(4, '0')} | Creator: ${interaction.user.id}`,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.AddReactions,
          ],
        },
        ...supportRoleIds.map(roleId => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.AddReactions,
          ],
        })),
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
      reason: `Ticket created by ${interaction.user.tag}`,
    });

    setTicketRecord(guildId, createdChannel.id, {
      ticketNumber,
      creatorId: interaction.user.id,
      issueTitle,
      issueDescription,
      status: 'open',
      createdAt: new Date().toISOString(),
      categoryId: category.id,
      panelChannelId: ticketConfig.panelChannelId,
      transcriptChannelId: ticketConfig.transcriptChannelId || null,
      supportRoleIds,
    });

    await createdChannel.send({
      content: `<@${interaction.user.id}> help is coming, please wait.`,
      allowedMentions: { users: [interaction.user.id] },
    });

    await createdChannel.send({
      embeds: [createTicketIssueEmbed(ticketNumber, issueTitle, issueDescription)],
    });

    await createdChannel.send({
      embeds: [createTicketStaffCommandsEmbed()],
    });

    setOpenTicketChannelForUser(guildId, interaction.user.id, createdChannel.id);

    await interaction.editReply({
      embeds: [createSuccessEmbed('✅ Ticket Created', `Your ticket has been created: ${createdChannel}`)],
    });
    return true;
  } catch (error) {
    console.error('Ticket modal error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while creating your ticket.')],
      });
    } else {
      await interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while creating your ticket.')],
        ephemeral: true,
      });
    }
    return true;
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command || typeof command.autocomplete !== 'function') {
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('sticky_create_') || interaction.customId.startsWith('sticky_update_')) {
        await handleStickyModal(interaction);
        return;
      }

      if (interaction.customId.startsWith('ticket_create_')) {
        await handleTicketModal(interaction);
        return;
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('giveaway-')) {
      const handled = await handleGiveawayButtonInteraction(interaction);
      if (handled) {
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket-open-')) {
      await handleTicketButton(interaction);
      return;
    }

    if (interaction.isButton() && (interaction.customId.startsWith('heads-') || interaction.customId.startsWith('tails-'))) {
      await handleCoinFlipButton(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'Command not found.')],
        ephemeral: true,
      });
    }

    const cooldownSeconds = getCooldown(interaction.user.id, command.data.name);
    if (cooldownSeconds) {
      return interaction.reply({
        embeds: [createCooldownEmbed(cooldownSeconds)],
        ephemeral: true,
      });
    }

    setCooldown(interaction.user.id, command.data.name, 5);

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);

      const reply = {
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while executing this command.')],
        ephemeral: true,
      };

      if (interaction.replied) {
        await interaction.followUp(reply);
      } else if (interaction.deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
