const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { readData } = require('./database');
const { getServerData, setServerData } = require('./serverData');
const { createErrorEmbed, createSuccessEmbed } = require('./embeds');

const MAX_TIMER_DELAY = 2_147_483_647;
const giveawayTimers = new Map();
const ENDED_GIVEAWAY_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let endedGiveawayCleanupInterval = null;

const GIVEAWAY_COLORS = 0x5865F2;

const WINNER_MESSAGES = [
  'Congratulations {winners}, you won the giveaway!',
  'We have our winners: {winners}!',
  'Lucky winners selected: {winners}!',
  'Giveaway ended, winners are {winners}.',
];

const REROLL_MESSAGES = [
  'The giveaway has been rerolled! New winners: {winners}',
  'New winners have been selected: {winners}',
  'Reroll complete! Congratulations {winners}',
  'We have new winners: {winners}',
];

const durationUnits = {
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
};

function normalizeGiveawayRecord(record = {}) {
  return {
    giveawayId: record.giveawayId || null,
    messageId: record.messageId || null,
    channelId: record.channelId || null,
    prize: record.prize || 'Giveaway',
    winnerCount: Math.max(1, Number(record.winnerCount) || 1),
    hostId: record.hostId || null,
    requiredRoleId: record.requiredRoleId || null,
    endAt: Number(record.endAt) || Date.now(),
    entries: Array.isArray(record.entries) ? [...new Set(record.entries.filter(Boolean))] : [],
    ended: Boolean(record.ended),
    endedAt: record.endedAt || null,
    winners: Array.isArray(record.winners) ? [...new Set(record.winners.filter(Boolean))] : [],
    createdAt: record.createdAt || new Date().toISOString(),
    createdBy: record.createdBy || null,
  };
}

function cloneGiveawayState(state = {}) {
  const clonedState = {};

  for (const [giveawayId, record] of Object.entries(state || {})) {
    clonedState[giveawayId] = normalizeGiveawayRecord({ giveawayId, ...record });
  }

  return clonedState;
}

function getGiveawayState(guildId) {
  const serverData = getServerData(guildId) || {};
  return cloneGiveawayState(serverData.giveaways);
}

function setGiveawayState(guildId, giveaways) {
  const serverData = getServerData(guildId) || {};
  serverData.giveaways = cloneGiveawayState(giveaways);
  setServerData(guildId, serverData);
  return serverData.giveaways;
}

function updateGiveawayState(guildId, updater) {
  const currentState = getGiveawayState(guildId);
  const clonedState = cloneGiveawayState(currentState);
  const nextState = typeof updater === 'function' ? updater(clonedState) || clonedState : { ...clonedState, ...updater };
  return setGiveawayState(guildId, nextState);
}

function saveGiveawayRecord(guildId, record) {
  const giveaway = normalizeGiveawayRecord(record);

  if (!giveaway.giveawayId) {
    throw new Error('A giveawayId is required to save a giveaway record.');
  }

  updateGiveawayState(guildId, state => {
    state[giveaway.giveawayId] = giveaway;
    return state;
  });

  return giveaway;
}

function patchGiveawayRecord(guildId, giveawayId, patch) {
  const existing = getGiveawayRecord(guildId, giveawayId);
  if (!existing) return null;

  return saveGiveawayRecord(guildId, {
    ...existing,
    ...patch,
    giveawayId,
  });
}

function getGiveawayRecord(guildId, giveawayId) {
  return getGiveawayState(guildId)[giveawayId] || null;
}

function deleteGiveawayRecord(guildId, giveawayId) {
  updateGiveawayState(guildId, state => {
    delete state[giveawayId];
    return state;
  });
}

function getAllGiveaways() {
  const allServers = readData('servers', {});
  const giveaways = [];

  for (const [guildId, serverData] of Object.entries(allServers)) {
    const serverGiveaways = serverData?.giveaways || {};

    for (const [giveawayId, record] of Object.entries(serverGiveaways)) {
      giveaways.push({ guildId, giveaway: normalizeGiveawayRecord({ giveawayId, ...record }) });
    }
  }

  return giveaways;
}

function cleanupEndedGiveaways() {
  const allServers = readData('servers', {});
  let removedCount = 0;
  const now = Date.now();

  for (const guildId of Object.keys(allServers)) {
    const currentState = getGiveawayState(guildId);
    const activeGiveaways = {};

    for (const [giveawayId, giveaway] of Object.entries(currentState)) {
      const endedAtMs = giveaway.endedAt
        ? new Date(giveaway.endedAt).getTime()
        : Number(giveaway.endAt) || 0;

      const shouldDeleteEndedGiveaway = giveaway.ended
        && endedAtMs > 0
        && (now - endedAtMs) >= ENDED_GIVEAWAY_CLEANUP_INTERVAL_MS;

      if (shouldDeleteEndedGiveaway) {
        removedCount += 1;
        continue;
      }

      activeGiveaways[giveawayId] = giveaway;
    }

    if (Object.keys(activeGiveaways).length !== Object.keys(currentState).length) {
      setGiveawayState(guildId, activeGiveaways);
    }
  }

  return removedCount;
}

function startEndedGiveawayCleanupScheduler() {
  if (endedGiveawayCleanupInterval) {
    return;
  }

  endedGiveawayCleanupInterval = setInterval(() => {
    try {
      const removedCount = cleanupEndedGiveaways();
      if (removedCount > 0) {
        console.log(`🧹 Giveaway cleanup removed ${removedCount} ended giveaway(s).`);
      }
    } catch (error) {
      console.error('Giveaway cleanup error:', error);
    }
  }, ENDED_GIVEAWAY_CLEANUP_INTERVAL_MS);
}

function clearGiveawayTimer(key) {
  const timer = giveawayTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    giveawayTimers.delete(key);
  }
}

function scheduleGiveawayEnd(client, guildId, giveawayId, endAt) {
  const timerKey = `${guildId}:${giveawayId}`;
  clearGiveawayTimer(timerKey);

  const scheduleStep = () => {
    const remaining = endAt - Date.now();

    if (remaining <= 0) {
      giveawayTimers.delete(timerKey);
      endGiveaway(client, guildId, giveawayId).catch(error => {
        console.error('Failed to end giveaway:', error);
      });
      return;
    }

    const timer = setTimeout(scheduleStep, Math.min(remaining, MAX_TIMER_DELAY));
    giveawayTimers.set(timerKey, timer);
  };

  scheduleStep();
}

async function initGiveaways(client) {
  startEndedGiveawayCleanupScheduler();

  const allGiveaways = getAllGiveaways();

  for (const { guildId, giveaway } of allGiveaways) {
    if (giveaway.ended) {
      continue;
    }

    if (giveaway.endAt <= Date.now()) {
      await endGiveaway(client, guildId, giveaway.giveawayId).catch(error => {
        console.error('Failed to process overdue giveaway:', error);
      });
      continue;
    }

    scheduleGiveawayEnd(client, guildId, giveaway.giveawayId, giveaway.endAt);
  }
}

function parseDurationInput(input) {
  if (!input || !input.trim()) {
    return null;
  }

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokenPattern = /(\d+)\s*(d|day|days|h|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g;
  let totalMs = 0;
  let tokenFound = false;

  const leftover = normalized.replace(tokenPattern, (_, amount, unit) => {
    tokenFound = true;
    totalMs += Number(amount) * durationUnits[unit];
    return ' ';
  });

  if (!tokenFound || totalMs <= 0) {
    return null;
  }

  if (leftover.replace(/\s+/g, '').length > 0) {
    return null;
  }

  return {
    durationMs: totalMs,
    endAt: Date.now() + totalMs,
  };
}

function formatMentionList(ids = []) {
  const mentions = ids.map(id => `<@${id}>`);

  if (mentions.length === 0) {
    return 'no one';
  }

  if (mentions.length === 1) {
    return mentions[0];
  }

  if (mentions.length === 2) {
    return `${mentions[0]} and ${mentions[1]}`;
  }

  return `${mentions.slice(0, -1).join(', ')}, and ${mentions.at(-1)}`;
}

function buildGiveawayEmbed(giveaway) {
  const endUnix = Math.floor(Number(giveaway.endAt) / 1000);
  const fields = [
    { name: 'Winners', value: String(giveaway.winnerCount), inline: true },
    { name: 'Ends', value: `<t:${endUnix}:R> (<t:${endUnix}:f>)`, inline: true },
  ];

  if (giveaway.hostId) {
    fields.push({ name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true });
  }

  if (giveaway.requiredRoleId) {
    fields.push({ name: 'Required role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
  }

  return new EmbedBuilder()
    .setColor(GIVEAWAY_COLORS)
    .setTitle(giveaway.prize)
    .setDescription('Click the 🎈 button below to enter!')
    .addFields(fields)
    .setTimestamp();
}

function buildEndedGiveawayEmbed(giveaway, winnerIds = []) {
  const endUnix = Math.floor(Number(giveaway.endAt) / 1000);
  const fields = [
    { name: 'Winners', value: String(giveaway.winnerCount), inline: true },
    { name: 'Ended', value: `<t:${endUnix}:R> (<t:${endUnix}:f>)`, inline: true },
  ];

  if (giveaway.hostId) {
    fields.push({ name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true });
  }

  if (giveaway.requiredRoleId) {
    fields.push({ name: 'Required role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
  }

  fields.push({
    name: 'Winner(s)',
    value: winnerIds.length > 0 ? formatMentionList(winnerIds) : 'No valid winners could be selected.',
    inline: false,
  });

  return new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle(giveaway.prize)
    .setDescription('This giveaway has ended.')
    .addFields(fields)
    .setTimestamp();
}

function buildGiveawayComponents(giveawayId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway-enter:${giveawayId}`)
        .setLabel('Enter Giveaway')
        .setEmoji('🎈')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`giveaway-participants:${giveawayId}`)
        .setLabel('Participants')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

function buildParticipantsPaginationComponents(giveawayId, page, totalPages) {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway-participants-page:${giveawayId}:${prevPage}:prev`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`giveaway-participants-page:${giveawayId}:${nextPage}:next`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    ),
  ];
}

function buildParticipantsEmbed(giveaway, page = 1) {
  const participants = giveaway.entries;
  const totalPages = Math.max(1, Math.ceil(participants.length / 10));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * 10;
  const pageEntries = participants.slice(startIndex, startIndex + 10);

  const description = pageEntries.length > 0
    ? pageEntries.map((userId, index) => `${startIndex + index + 1}. <@${userId}>`).join('\n')
    : 'No participants have entered yet.';

  const prefix = 'Participants - ';
  const maxPrizeLength = Math.max(0, 256 - prefix.length);
  const titlePrize = giveaway.prize.substring(0, maxPrizeLength);

  return {
    embed: new EmbedBuilder()
      .setColor(GIVEAWAY_COLORS)
      .setTitle(`${prefix}${titlePrize}`)
      .setDescription(description)
      .setFooter({ text: `Page ${safePage} of ${totalPages} • Total participants: ${participants.length}` })
      .setTimestamp(),
    page: safePage,
    totalPages,
  };
}

function getWinnerAnnouncement(winnerIds) {
  const template = WINNER_MESSAGES[Math.floor(Math.random() * WINNER_MESSAGES.length)];
  return template.replace('{winners}', formatMentionList(winnerIds));
}

async function endGiveaway(client, guildId, giveawayId) {
  const giveaway = getGiveawayRecord(guildId, giveawayId);

  if (!giveaway || giveaway.ended) {
    return null;
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return patchGiveawayRecord(guildId, giveawayId, {
      ended: true,
      endedAt: new Date().toISOString(),
    });
  }

  const validEntries = [...new Set(giveaway.entries.filter(Boolean))];
  const validWinnerIds = [];
  const shuffledEntries = [...validEntries];

  for (let index = shuffledEntries.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledEntries[index], shuffledEntries[randomIndex]] = [shuffledEntries[randomIndex], shuffledEntries[index]];
  }

  for (const userId of shuffledEntries) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      continue;
    }

    if (member.user?.bot) {
      continue;
    }

    validWinnerIds.push(userId);
    if (validWinnerIds.length >= Math.min(giveaway.winnerCount, validEntries.length)) {
      break;
    }
  }

  const updatedGiveaway = patchGiveawayRecord(guildId, giveawayId, {
    ended: true,
    endedAt: new Date().toISOString(),
    winners: validWinnerIds,
  });

  const channel = guild.channels.cache.get(giveaway.channelId) || await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return updatedGiveaway;
  }

  const announcementText = getWinnerAnnouncement(validWinnerIds);
  const winnerAnnouncementPayload = {
    content: validWinnerIds.length > 0 ? announcementText : 'The giveaway ended, but no valid winners could be selected.',
    allowedMentions: validWinnerIds.length > 0 ? { users: validWinnerIds } : { parse: [] },
  };

  const endingEmbed = buildEndedGiveawayEmbed(updatedGiveaway || giveaway, validWinnerIds);
  const disabledComponents = buildGiveawayComponents(giveawayId, true);

  if (giveaway.messageId) {
    const giveawayMessage = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (giveawayMessage) {
      await giveawayMessage.edit({
        embeds: [endingEmbed],
        components: disabledComponents,
      }).catch(error => {
        console.error('Failed to update giveaway message:', error.message);
      });
    }
  }

  await channel.send({
    ...winnerAnnouncementPayload,
  }).catch(error => {
    console.error('Failed to send giveaway winner announcement:', error.message);
  });

  return updatedGiveaway;
}

async function handleGiveawayEntry(interaction) {
  const giveawayId = interaction.customId.split(':')[1];
  const giveaway = getGiveawayRecord(interaction.guildId, giveawayId);

  if (!giveaway) {
    await interaction.reply({
      embeds: [createErrorEmbed('❌ Giveaway Not Found', 'This giveaway could not be found or may have been removed.')],
      ephemeral: true,
    });
    return true;
  }

  if (giveaway.ended || giveaway.endAt <= Date.now()) {
    await interaction.reply({
      embeds: [createErrorEmbed('❌ Giveaway Ended', 'This giveaway has already ended.')],
      ephemeral: true,
    });
    return true;
  }

  if (giveaway.requiredRoleId && !interaction.member.roles.cache.has(giveaway.requiredRoleId)) {
    await interaction.reply({
      embeds: [createErrorEmbed('❌ Entry Denied', `You need the <@&${giveaway.requiredRoleId}> role to join this giveaway.`)],
      ephemeral: true,
    });
    return true;
  }

  if (giveaway.entries.includes(interaction.user.id)) {
    await interaction.reply({
      embeds: [createErrorEmbed('❌ Already Entered', 'You are already entered in this giveaway.')],
      ephemeral: true,
    });
    return true;
  }

  patchGiveawayRecord(interaction.guildId, giveawayId, {
    entries: [...giveaway.entries, interaction.user.id],
  });

  await interaction.reply({
    embeds: [createSuccessEmbed('✅ Entered', 'You successfully entered the giveaway!')],
    ephemeral: true,
  });

  return true;
}

async function handleGiveawayParticipants(interaction) {
  const giveawayId = interaction.customId.split(':')[1];
  const giveaway = getGiveawayRecord(interaction.guildId, giveawayId);

  if (!giveaway) {
    await interaction.reply({
      embeds: [createErrorEmbed('❌ Giveaway Not Found', 'This giveaway could not be found or may have been removed.')],
      ephemeral: true,
    });
    return true;
  }

  const { embed, page, totalPages } = buildParticipantsEmbed(giveaway, 1);

  await interaction.reply({
    embeds: [embed],
    components: buildParticipantsPaginationComponents(giveawayId, page, totalPages),
    ephemeral: true,
  });

  return true;
}

async function handleGiveawayParticipantsPage(interaction) {
  const parts = interaction.customId.split(':');
  const giveawayId = parts[1];
  const requestedPage = Number(parts[2]) || 1;
  const giveaway = getGiveawayRecord(interaction.guildId, giveawayId);

  if (!giveaway) {
    await interaction.update({
      embeds: [createErrorEmbed('❌ Giveaway Not Found', 'This giveaway could not be found or may have been removed.')],
      components: [],
    });
    return true;
  }

  const { embed, page, totalPages } = buildParticipantsEmbed(giveaway, requestedPage);

  await interaction.update({
    embeds: [embed],
    components: buildParticipantsPaginationComponents(giveawayId, page, totalPages),
  });

  return true;
}

async function handleGiveawayButtonInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('giveaway-')) {
    return false;
  }

  if (interaction.customId.startsWith('giveaway-enter:')) {
    return handleGiveawayEntry(interaction);
  }

  if (interaction.customId.startsWith('giveaway-participants-page:')) {
    return handleGiveawayParticipantsPage(interaction);
  }

  if (interaction.customId.startsWith('giveaway-participants:')) {
    return handleGiveawayParticipants(interaction);
  }

  return false;
}

async function rerollGiveaway(client, guildId, giveawayId, userIdsToReroll = null) {
  const giveaway = getGiveawayRecord(guildId, giveawayId);

  if (!giveaway) {
    return { success: false, error: 'Giveaway not found.' };
  }

  if (!giveaway.ended) {
    return { success: false, error: 'You can only reroll ended giveaways.' };
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return { success: false, error: 'Guild not found.' };
  }

  const validEntries = [...new Set(giveaway.entries.filter(Boolean))];
  const currentWinners = [...new Set(giveaway.winners.filter(Boolean))];

  let winnersToReroll = [];

  if (userIdsToReroll && userIdsToReroll.length > 0) {
    winnersToReroll = userIdsToReroll.filter(userId => currentWinners.includes(userId));

    for (const userId of userIdsToReroll) {
      if (!currentWinners.includes(userId)) {
        return { success: false, error: `<@${userId}> did not win this giveaway and cannot be rerolled.` };
      }
    }
  } else {
    winnersToReroll = currentWinners;
  }

  if (winnersToReroll.length === 0) {
    return { success: false, error: 'No valid winners to reroll.' };
  }

  const rerollCandidates = validEntries.filter(id => !winnersToReroll.includes(id));

  const newRerolledWinnerIds = [];
  const shuffledCandidates = [...rerollCandidates];

  for (let index = shuffledCandidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledCandidates[index], shuffledCandidates[randomIndex]] = [shuffledCandidates[randomIndex], shuffledCandidates[index]];
  }

  for (const userId of shuffledCandidates) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user?.bot) {
      continue;
    }

    newRerolledWinnerIds.push(userId);
    if (newRerolledWinnerIds.length >= winnersToReroll.length) {
      break;
    }
  }

  if (newRerolledWinnerIds.length === 0) {
    return { success: false, error: 'No valid participants available to reroll.' };
  }

  const updatedWinners = currentWinners.map(id => (winnersToReroll.includes(id) ? null : id)).filter(Boolean);
  updatedWinners.push(...newRerolledWinnerIds);

  const updatedGiveaway = patchGiveawayRecord(guildId, giveawayId, {
    winners: updatedWinners,
  });

  return {
    success: true,
    giveaway: updatedGiveaway,
    newWinnerIds: newRerolledWinnerIds,
    rerolledUserIds: winnersToReroll,
  };
}

module.exports = {
  initGiveaways,
  parseDurationInput,
  scheduleGiveawayEnd,
  saveGiveawayRecord,
  patchGiveawayRecord,
  getGiveawayRecord,
    getGiveawayState,
  deleteGiveawayRecord,
  buildGiveawayEmbed,
  buildGiveawayComponents,
  buildParticipantsPaginationComponents,
  buildParticipantsEmbed,
  buildEndedGiveawayEmbed,
  endGiveaway,
  handleGiveawayButtonInteraction,
  formatMentionList,
  rerollGiveaway,
  REROLL_MESSAGES,
  cleanupEndedGiveaways,
};