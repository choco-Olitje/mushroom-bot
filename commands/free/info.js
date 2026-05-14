const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, createErrorEmbed } = require('../../utils/embeds');

const SUPPORT_URL = 'https://discord.gg/AEaVX5jm7H';
const COMMANDS_ROOT = path.join(__dirname, '..');
const FREE_DIR = path.join(COMMANDS_ROOT, 'free');
const PREMIUM_DIR = path.join(COMMANDS_ROOT, 'premium');
const FIELD_LIMIT = 1024;

let cachedCategoryMap = null;

function readCommandNamesFromDirectory(dirPath) {
  const commandNames = new Set();
  const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(dirPath, file);

    try {
      const command = require(filePath);
      const commandName = command?.data?.name;

      if (commandName) {
        commandNames.add(commandName);
      }
    } catch (error) {
      console.error(`Failed to inspect command file ${filePath}:`, error.message);
    }
  }

  return commandNames;
}

function getCategoryMap() {
  if (cachedCategoryMap) return cachedCategoryMap;

  cachedCategoryMap = {
    free: readCommandNamesFromDirectory(FREE_DIR),
    premium: readCommandNamesFromDirectory(PREMIUM_DIR),
  };

  return cachedCategoryMap;
}

function cleanDescription(description = '') {
  return String(description)
    .replace(/^\[PREMIUM\]\s*/i, '')
    .replace(/\s*\(Premium only\)\s*/i, '')
    .trim();
}

function sortByName(commands) {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name));
}

function formatCommandLine(command) {
  const description = cleanDescription(command.description) || 'No description available.';
  return `- /${command.name} -> ${description}`;
}

function getFreeSection(commandName) {
  if (['ban', 'kick', 'time-out'].includes(commandName)) return 'Moderation';
  if (['level', 'set-counter'].includes(commandName)) return 'Leveling / XP';
  if (['set-birthday', 'birthday-setup'].includes(commandName)) return 'Birthday';
  if (['setup-ticket', 'close-ticket', 'delete-ticket', 'transcript-ticket'].includes(commandName)) return 'Tickets';
  if (['set-welcome', 'delete-welcome'].includes(commandName)) return 'Welcome';
  if (['set-autorole', 'delete-autorole'].includes(commandName)) return 'Auto-Role';
  if (['play'].includes(commandName)) return 'Music';
  if (['subscription'].includes(commandName)) return 'Premium Access';
  if (['give-premium'].includes(commandName)) return 'Owner Tools';
  if (['balance', 'daily', 'work', 'shop', 'buy', 'sell', 'pay', 'inventory', 'economy'].some(word => commandName.includes(word))) {
    return 'Economy';
  }

  return 'Other Free Commands';
}

function buildSectionText(sectionTitle, lines) {
  return [`**${sectionTitle}**`, ...lines, ''].join('\n');
}

function chunkFieldValues(sectionBlocks) {
  const chunks = [];
  let current = '';

  for (const block of sectionBlocks) {
    if (!current) {
      current = block;
      continue;
    }

    const candidate = `${current}\n${block}`;
    if (candidate.length > FIELD_LIMIT) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function addChunkedFields(embed, title, chunks, inline = false) {
  if (chunks.length === 0) {
    embed.addFields({ name: title, value: 'No commands available right now.', inline });
    return;
  }

  chunks.forEach((chunk, index) => {
    const fieldName = chunks.length === 1 ? title : `${title} (${index + 1}/${chunks.length})`;
    embed.addFields({ name: fieldName, value: chunk, inline });
  });
}

function getCommandsByAccess(clientCommands, categoryMap) {
  const free = [];
  const premium = [];

  clientCommands.forEach(command => {
    if (!command?.data?.name) return;

    const commandInfo = {
      name: command.data.name,
      description: command.data.description || '',
    };

    if (categoryMap.premium.has(commandInfo.name)) {
      premium.push(commandInfo);
      return;
    }

    if (categoryMap.free.has(commandInfo.name)) {
      free.push(commandInfo);
      return;
    }

    // Default unknown commands to free so this hub remains user-helpful.
    free.push(commandInfo);
  });

  return { free: sortByName(free), premium: sortByName(premium) };
}

function buildFreeBlocks(freeCommands) {
  const sectionMap = new Map([
    ['Moderation', []],
    ['Leveling / XP', []],
    ['Economy', []],
    ['Music', []],
    ['Birthday', []],
    ['Tickets', []],
    ['Welcome', []],
    ['Auto-Role', []],
    ['Premium Access', []],
    ['Owner Tools', []],
    ['Other Free Commands', []],
  ]);

  freeCommands.forEach(command => {
    const sectionName = getFreeSection(command.name);
    if (!sectionMap.has(sectionName)) sectionMap.set(sectionName, []);
    sectionMap.get(sectionName).push(formatCommandLine(command));
  });

  const blocks = [];
  for (const [sectionName, lines] of sectionMap.entries()) {
    if (lines.length === 0) continue;
    blocks.push(buildSectionText(sectionName, lines));
  }

  return blocks;
}

function buildPremiumBlocks(premiumCommands) {
  if (premiumCommands.length === 0) return [];

  const premiumLines = premiumCommands.map(formatCommandLine);
  return [buildSectionText('Premium Commands', premiumLines)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show all bot commands, features, and support information'),

  async execute(interaction) {
    try {
      const categoryMap = getCategoryMap();
      const { free, premium } = getCommandsByAccess(interaction.client.commands, categoryMap);

      const freeBlocks = buildFreeBlocks(free);
      const premiumBlocks = buildPremiumBlocks(premium);

      const embed = createEmbed(
        'Ultimate Bot Info Hub',
        'Browse all available commands by access level and feature area.',
        0x00AFF4
      );

      addChunkedFields(embed, 'Free Commands', chunkFieldValues(freeBlocks), false);
      addChunkedFields(embed, 'Premium Commands', chunkFieldValues(premiumBlocks), false);

      embed
        .addFields({
          name: 'Premium Information',
          value: 'Use /subscription to unlock premium features for your server.',
          inline: false,
        })
        .addFields({
          name: 'Support',
          value: `Need support? Join the official Discord server:\n${SUPPORT_URL}`,
          inline: false,
        });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('info command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('Error', 'An error occurred while building the info panel.')],
        ephemeral: true,
      });
    }
  },
};
