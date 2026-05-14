const fs = require('fs/promises');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getServerData, setServerData } = require('./serverData');

const DEFAULT_TICKET_BUTTON_TEXT = '📩 Create Ticket';

const DEFAULT_TICKET_STATE = {
  ticketName: null,
  categoryId: null,
  panelChannelId: null,
  transcriptChannelId: null,
  buttonText: DEFAULT_TICKET_BUTTON_TEXT,
  supportRoleIds: [],
  nextTicketNumber: 1,
  tickets: {},
  openTicketsByUser: {},
  panelMessageId: null,
};

function normalizeTicketState(ticketState = {}) {
  return {
    ...DEFAULT_TICKET_STATE,
    ...ticketState,
    buttonText: ticketState.buttonText || DEFAULT_TICKET_BUTTON_TEXT,
    supportRoleIds: Array.isArray(ticketState.supportRoleIds)
      ? [...new Set(ticketState.supportRoleIds.filter(Boolean))]
      : [],
    tickets: ticketState.tickets && typeof ticketState.tickets === 'object' ? ticketState.tickets : {},
    openTicketsByUser:
      ticketState.openTicketsByUser && typeof ticketState.openTicketsByUser === 'object'
        ? ticketState.openTicketsByUser
        : {},
    nextTicketNumber:
      Number.isInteger(ticketState.nextTicketNumber) && ticketState.nextTicketNumber > 0
        ? ticketState.nextTicketNumber
        : 1,
  };
}

function getTicketState(guildId) {
  const serverData = getServerData(guildId) || {};
  return normalizeTicketState(serverData.ticketSystem);
}

function setTicketState(guildId, ticketState) {
  const serverData = getServerData(guildId) || {};
  serverData.ticketSystem = normalizeTicketState(ticketState);
  setServerData(guildId, serverData);
  return serverData.ticketSystem;
}

function updateTicketState(guildId, updater) {
  const currentState = getTicketState(guildId);
  const clonedState = {
    ...currentState,
    supportRoleIds: [...currentState.supportRoleIds],
    tickets: { ...currentState.tickets },
    openTicketsByUser: { ...currentState.openTicketsByUser },
  };

  const updatedState = typeof updater === 'function' ? updater(clonedState) || clonedState : { ...clonedState, ...updater };

  return setTicketState(guildId, updatedState);
}

function getTicketConfig(guildId) {
  return getTicketState(guildId);
}

function setTicketConfig(guildId, config) {
  return updateTicketState(guildId, state => ({
    ...state,
    ...config,
    supportRoleIds: Array.isArray(config.supportRoleIds)
      ? [...new Set(config.supportRoleIds.filter(Boolean))]
      : state.supportRoleIds,
  }));
}

function getTicketRecord(guildId, channelId) {
  const state = getTicketState(guildId);
  return state.tickets[channelId] || null;
}

function setTicketRecord(guildId, channelId, record) {
  return updateTicketState(guildId, state => {
    state.tickets[channelId] = {
      ...(state.tickets[channelId] || {}),
      ...record,
    };
    return state;
  });
}

function updateTicketRecord(guildId, channelId, patch) {
  return setTicketRecord(guildId, channelId, patch);
}

function getOpenTicketChannelIdForUser(guildId, userId) {
  const state = getTicketState(guildId);
  return state.openTicketsByUser[userId] || null;
}

function setOpenTicketChannelForUser(guildId, userId, channelId) {
  return updateTicketState(guildId, state => {
    state.openTicketsByUser[userId] = channelId;
    return state;
  });
}

function clearOpenTicketChannelForUser(guildId, userId) {
  return updateTicketState(guildId, state => {
    delete state.openTicketsByUser[userId];
    return state;
  });
}

function clearOpenTicketForChannel(guildId, channelId) {
  return updateTicketState(guildId, state => {
    for (const [userId, activeChannelId] of Object.entries(state.openTicketsByUser)) {
      if (activeChannelId === channelId) {
        delete state.openTicketsByUser[userId];
      }
    }
    return state;
  });
}

function isTicketChannel(guildId, channelId) {
  return Boolean(getTicketRecord(guildId, channelId));
}

function allocateTicketNumber(guildId) {
  let allocatedNumber = 1;

  updateTicketState(guildId, state => {
    allocatedNumber = state.nextTicketNumber || 1;
    state.nextTicketNumber = allocatedNumber + 1;
    return state;
  });

  return allocatedNumber;
}

function formatTicketNumber(ticketNumber) {
  return String(ticketNumber).padStart(4, '0');
}

function buildTicketChannelName(ticketNumber) {
  return `ticket-${formatTicketNumber(ticketNumber)}`;
}

function buildClosedTicketChannelName(ticketNumber) {
  return `closed-${formatTicketNumber(ticketNumber)}`;
}

function buildDeletedTicketChannelName(ticketNumber) {
  return `deleted-${formatTicketNumber(ticketNumber)}`;
}

async function parseSupportRoleIds(guild, rawValue) {
  if (!rawValue || !rawValue.trim()) return [];

  const roleIds = new Set();
  const matches = rawValue.matchAll(/<@&(\d{15,20})>|(\d{15,20})/g);

  for (const match of matches) {
    const roleId = match[1] || match[2];
    if (roleId) roleIds.add(roleId);
  }

  const resolvedRoleIds = [];

  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (role && role.id !== guild.id) {
      resolvedRoleIds.push(role.id);
    }
  }

  return [...new Set(resolvedRoleIds)];
}

function hasTicketManagementAccess(member, supportRoleIds) {
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  return supportRoleIds.some(roleId => member.roles.cache.has(roleId));
}

function createTicketPanelEmbed(ticketName) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle(ticketName)
    .setDescription('Click the button below to create a ticket for your issue.')
    .setTimestamp();
}

function createTicketIssueEmbed(ticketNumber, issueTitle, issueDescription) {
  return new EmbedBuilder()
    .setColor(0x00AFF4)
    .setTitle(`Ticket #${formatTicketNumber(ticketNumber)}`)
    .addFields(
      { name: 'Issue Title', value: issueTitle || 'No title provided', inline: false },
      { name: 'Issue Description', value: issueDescription || 'No description provided', inline: false },
    )
    .setTimestamp();
}

function createTicketStaffCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Staff Commands')
    .setDescription([
      '/close-ticket - Close the ticket and lock the creator from sending messages',
      '/transcript-ticket - Send a transcript to the configured transcript channel',
      '/delete-ticket - Rename and delete the ticket channel',
    ].join('\n'))
    .setTimestamp();
}

async function fetchAllChannelMessages(channel) {
  const collectedMessages = [];
  let beforeId;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(beforeId ? { before: beforeId } : {}),
    }).catch(() => null);

    if (!batch || batch.size === 0) {
      break;
    }

    collectedMessages.push(...batch.values());

    if (batch.size < 100) {
      break;
    }

    beforeId = batch.last().id;
  }

  return collectedMessages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
}

function formatTranscriptMessage(message) {
  const lines = [];
  const timestamp = new Date(message.createdTimestamp).toISOString();
  const authorLabel = `${message.author?.tag || 'Unknown User'} (${message.author?.id || 'unknown'})${message.author?.bot ? ' [BOT]' : ''}`;
  const content = message.content && message.content.trim() ? message.content.trim() : '';

  lines.push(`[${timestamp}] ${authorLabel}`);

  if (content) {
    lines.push(content);
  }

  if (message.attachments?.size) {
    for (const attachment of message.attachments.values()) {
      lines.push(`[Attachment] ${attachment.url}`);
    }
  }

  if (message.embeds?.length) {
    for (const embed of message.embeds) {
      const embedBits = [];
      if (embed.title) embedBits.push(`Title: ${embed.title}`);
      if (embed.description) embedBits.push(`Description: ${embed.description}`);
      if (embed.url) embedBits.push(`URL: ${embed.url}`);
      if (embedBits.length > 0) {
        lines.push(`[Embed] ${embedBits.join(' | ')}`);
      }
    }
  }

  return lines.join('\n');
}

async function buildTranscriptAttachment(channel, ticketRecord) {
  const messages = await fetchAllChannelMessages(channel);
  const lines = [
    'Ticket Transcript',
    `Guild: ${channel.guild.name} (${channel.guild.id})`,
    `Channel: ${channel.name} (${channel.id})`,
    `Ticket Number: #${formatTicketNumber(ticketRecord.ticketNumber)}`,
    `Creator: <@${ticketRecord.creatorId}> (${ticketRecord.creatorId})`,
    `Issue Title: ${ticketRecord.issueTitle || 'No title provided'}`,
    `Issue Description: ${ticketRecord.issueDescription || 'No description provided'}`,
    `Status: ${ticketRecord.status || 'open'}`,
    `Generated At: ${new Date().toISOString()}`,
    '',
  ];

  if (messages.length === 0) {
    lines.push('No messages were found in this ticket channel.');
  } else {
    for (const message of messages) {
      lines.push(formatTranscriptMessage(message));
      lines.push('---');
    }
  }

  const transcriptText = lines.join('\n');
  const fileName = `ticket-${formatTicketNumber(ticketRecord.ticketNumber)}-transcript.txt`;
  const transcriptPath = path.join(process.cwd(), '.ticket-transcripts', fileName);

  await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
  await fs.writeFile(transcriptPath, transcriptText, 'utf8');

  return new AttachmentBuilder(transcriptPath, { name: fileName });
}

module.exports = {
  DEFAULT_TICKET_BUTTON_TEXT,
  getTicketState,
  setTicketState,
  updateTicketState,
  getTicketConfig,
  setTicketConfig,
  getTicketRecord,
  setTicketRecord,
  updateTicketRecord,
  getOpenTicketChannelIdForUser,
  setOpenTicketChannelForUser,
  clearOpenTicketChannelForUser,
  clearOpenTicketForChannel,
  isTicketChannel,
  allocateTicketNumber,
  formatTicketNumber,
  buildTicketChannelName,
  buildClosedTicketChannelName,
  buildDeletedTicketChannelName,
  parseSupportRoleIds,
  hasTicketManagementAccess,
  createTicketPanelEmbed,
  createTicketIssueEmbed,
  createTicketStaffCommandsEmbed,
  fetchAllChannelMessages,
  buildTranscriptAttachment,
};