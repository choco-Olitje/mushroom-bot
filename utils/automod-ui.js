const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const { getAutomodConfig } = require('./automod');

const TOGGLE_LABELS = {
  antiSpam: 'Anti Spam',
  antiLinks: 'Anti Links',
  antiInvites: 'Anti Discord Invites',
  antiMassMentions: 'Anti Mass Mentions',
  antiCapsSpam: 'Anti Caps Spam',
  duplicateMessages: 'Duplicate Msg',
  antiRaid: 'Anti Raid',
  bannedWords: 'Banned Words',
};

function statusText(value) {
  return value ? 'ON' : 'OFF';
}

function statusEmoji(value) {
  return value ? '🟢' : '🔴';
}

function toggleButton(guildId, key, shortLabel, value) {
  return new ButtonBuilder()
    .setCustomId(`automod_toggle_${guildId}_${key}`)
    .setLabel(`${shortLabel}: ${value ? 'ON' : 'OFF'}`)
    .setStyle(value ? ButtonStyle.Success : ButtonStyle.Danger);
}

function buildAutomodPanel(guildId) {
  const config = getAutomodConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x00cc66 : 0xff9900)
    .setTitle('🛡️ Premium Automod Setup')
    .setDescription('Configure protections using the controls below. Changes are live and can be saved.')
    .addFields(
      {
        name: 'Status',
        value: config.enabled ? 'Enabled' : 'Disabled',
        inline: true,
      },
      {
        name: 'Punishment',
        value: config.punishment,
        inline: true,
      },
      {
        name: 'Log Channel',
        value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set',
        inline: true,
      },
      {
        name: 'Protections',
        value: [
          `${statusEmoji(config.protection.antiSpam)} ${TOGGLE_LABELS.antiSpam}: ${statusText(config.protection.antiSpam)}`,
          `${statusEmoji(config.protection.antiLinks)} ${TOGGLE_LABELS.antiLinks}: ${statusText(config.protection.antiLinks)}`,
          `${statusEmoji(config.protection.antiInvites)} ${TOGGLE_LABELS.antiInvites}: ${statusText(config.protection.antiInvites)}`,
          `${statusEmoji(config.protection.antiMassMentions)} ${TOGGLE_LABELS.antiMassMentions}: ${statusText(config.protection.antiMassMentions)}`,
          `${statusEmoji(config.protection.antiCapsSpam)} ${TOGGLE_LABELS.antiCapsSpam}: ${statusText(config.protection.antiCapsSpam)}`,
          `${statusEmoji(config.protection.duplicateMessages)} Duplicate Message Spam: ${statusText(config.protection.duplicateMessages)}`,
          `${statusEmoji(config.protection.antiRaid)} ${TOGGLE_LABELS.antiRaid}: ${statusText(config.protection.antiRaid)}`,
          `${statusEmoji(config.protection.bannedWords)} ${TOGGLE_LABELS.bannedWords}: ${statusText(config.protection.bannedWords)}`,
        ].join('\n'),
      },
      {
        name: 'Banned Words Count',
        value: String(config.bannedWords.length),
        inline: true,
      }
    )
    .setFooter({ text: 'Most interactions are ephemeral and update this panel instantly.' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    toggleButton(guildId, 'antiSpam', 'Spam', config.protection.antiSpam),
    toggleButton(guildId, 'antiLinks', 'Links', config.protection.antiLinks),
    toggleButton(guildId, 'antiInvites', 'Invites', config.protection.antiInvites)
  );

  const row2 = new ActionRowBuilder().addComponents(
    toggleButton(guildId, 'antiMassMentions', 'Mentions', config.protection.antiMassMentions),
    toggleButton(guildId, 'antiCapsSpam', 'Caps', config.protection.antiCapsSpam),
    toggleButton(guildId, 'duplicateMessages', 'Duplicate', config.protection.duplicateMessages)
  );

  const row3 = new ActionRowBuilder().addComponents(
    toggleButton(guildId, 'antiRaid', 'Raid', config.protection.antiRaid),
    toggleButton(guildId, 'bannedWords', 'Words', config.protection.bannedWords),
    new ButtonBuilder()
      .setCustomId(`automod_manage_${guildId}`)
      .setLabel('Manage Banned Words')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_save_${guildId}`)
      .setLabel('Save Setup')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`automod_disable_${guildId}`)
      .setLabel('Disable Automod')
      .setStyle(ButtonStyle.Danger)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`automod_log_${guildId}`)
      .setPlaceholder('Select automod log channel')
      .setMinValues(1)
      .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText)
  );

  const row5 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`automod_punish_${guildId}`)
      .setPlaceholder('Select punishment')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        {
          label: 'Delete Message Only',
          value: 'delete',
          default: config.punishment === 'delete',
        },
        {
          label: 'Warn',
          value: 'warn',
          default: config.punishment === 'warn',
        },
        {
          label: 'Timeout',
          value: 'timeout',
          default: config.punishment === 'timeout',
        },
        {
          label: 'Kick',
          value: 'kick',
          default: config.punishment === 'kick',
        },
        {
          label: 'Ban',
          value: 'ban',
          default: config.punishment === 'ban',
        }
      )
  );

  return { embed, components: [row1, row2, row3, row4, row5], config };
}

module.exports = { buildAutomodPanel };
