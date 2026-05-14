const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { createErrorEmbed, createPermissionDeniedEmbed, createSuccessEmbed } = require('../../utils/embeds');
const {
  getGiveawayState,
  getGiveawayRecord,
  rerollGiveaway,
  REROLL_MESSAGES,
  formatMentionList,
} = require('../../utils/giveaways');

function parseUserIds(input) {
  if (!input || !input.trim()) {
    return [];
  }

  const userIds = new Set();
  const mentionPattern = /<@(\d+)>/g;
  const rawIdPattern = /\b(\d{15,20})\b/g;

  for (const match of input.matchAll(mentionPattern)) {
    userIds.add(match[1]);
  }

  for (const match of input.matchAll(rawIdPattern)) {
    userIds.add(match[1]);
  }

  return [...userIds];
}

function resolveGiveawayFromInput(giveawayState, inputValue) {
  if (!inputValue) return null;

  if (giveawayState[inputValue] && giveawayState[inputValue].ended) {
    return { giveawayId: inputValue, giveaway: giveawayState[inputValue] };
  }

  const normalizedInput = inputValue.trim().toLowerCase();
  if (!normalizedInput) return null;

  const endedEntries = Object.entries(giveawayState).filter(([, giveaway]) => giveaway.ended);

  const exactMatch = endedEntries.find(([, giveaway]) => giveaway.prize.toLowerCase() === normalizedInput);
  if (exactMatch) {
    return { giveawayId: exactMatch[0], giveaway: exactMatch[1] };
  }

  const partialMatch = endedEntries.find(([, giveaway]) => giveaway.prize.toLowerCase().includes(normalizedInput));
  if (partialMatch) {
    return { giveawayId: partialMatch[0], giveaway: partialMatch[1] };
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reroll-giveaway')
    .setDescription('Reroll winners from a previously ended giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('giveaway')
        .setDescription('The giveaway to reroll')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('users')
        .setDescription('Optional: Space-separated user IDs or mentions to reroll (only for multi-winner giveaways)')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const giveawayState = getGiveawayState(interaction.guildId);
    const endedGiveaways = [];

    for (const [giveawayId, giveaway] of Object.entries(giveawayState)) {
      if (giveaway.ended) {
        endedGiveaways.push({
          id: giveawayId,
          prize: giveaway.prize,
          winnerCount: giveaway.winnerCount,
          winners: giveaway.winners.length,
        });
      }
    }

    const filtered = endedGiveaways
      .filter(g => g.prize.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25)
      .map(g => ({
        name: `${g.prize} (${g.winners}/${g.winnerCount} winners)`,
        value: g.id,
      }));

    await interaction.respond(filtered);
  },

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const giveawayInput = interaction.options.getString('giveaway', true);
    const usersInput = interaction.options.getString('users');
    const giveawayState = getGiveawayState(interaction.guildId);
    const resolvedGiveaway = resolveGiveawayFromInput(giveawayState, giveawayInput);

    if (!resolvedGiveaway) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Giveaway Not Found', 'The selected giveaway could not be found. Use autocomplete or provide the exact giveaway title.')],
        ephemeral: true,
      });
    }

    const { giveawayId, giveaway } = resolvedGiveaway;

    try {
      await interaction.deferReply({ ephemeral: true });

      let userIdsToReroll = null;

      if (usersInput) {
        userIdsToReroll = parseUserIds(usersInput);

        if (userIdsToReroll.length === 0) {
          return interaction.editReply({
            embeds: [createErrorEmbed('❌ Invalid Users', 'Could not parse any valid user IDs or mentions from your input.')],
          });
        }
      }

      const rerollResult = await rerollGiveaway(
        interaction.client,
        interaction.guildId,
        giveawayId,
        userIdsToReroll
      );

      if (!rerollResult.success) {
        return interaction.editReply({
          embeds: [createErrorEmbed('❌ Reroll Failed', rerollResult.error)],
        });
      }

      await interaction.editReply({
        embeds: [createSuccessEmbed('✅ Reroll Complete', 'The giveaway has been rerolled successfully.')],
      });

      const channel = interaction.guild.channels.cache.get(giveaway.channelId)
        || await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        return;
      }

      const announcementTemplate = REROLL_MESSAGES[Math.floor(Math.random() * REROLL_MESSAGES.length)];
      const announcementText = announcementTemplate.replace('{winners}', formatMentionList(rerollResult.newWinnerIds));

      await channel.send({
        content: announcementText,
        allowedMentions: { users: rerollResult.newWinnerIds },
      }).catch(error => {
        console.error('Failed to send reroll announcement:', error.message);
      });
    } catch (error) {
      console.error('reroll-giveaway command error:', error);

      if (interaction.deferred) {
        await interaction.editReply({
          embeds: [createErrorEmbed('❌ Error', 'An error occurred while rerolling the giveaway.')],
        });
      } else {
        await interaction.reply({
          embeds: [createErrorEmbed('❌ Error', 'An error occurred while rerolling the giveaway.')],
          ephemeral: true,
        });
      }
    }
  },
};
