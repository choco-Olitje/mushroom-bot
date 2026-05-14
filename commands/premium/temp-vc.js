const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { getTempVCSetup, updateTempVC } = require('../../utils/serverData');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temp-vc')
    .setDescription('[PREMIUM] Manage temporary voice channels')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up a "Create VC" channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Voice channel for creating temp VCs')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-owner')
        .setDescription('Transfer temp VC ownership')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('New owner')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-limit')
        .setDescription('Set user limit for temp VC')
        .addNumberOption(option =>
          option.setName('limit')
            .setDescription('User limit (0 = unlimited)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('blacklist')
        .setDescription('Block a user from temp VC')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to block')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist')
        .setDescription('Allow a user to temp VC')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to allow')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('private')
        .setDescription('Lock/unlock your temp VC')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rename')
        .setDescription('Rename your temp VC')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('New channel name')
            .setRequired(true)
            .setMaxLength(100)
        )
    ),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'setup') {
      return handleSetup(interaction);
    } else if (subcommand === 'set-owner') {
      return handleSetOwner(interaction);
    } else if (subcommand === 'set-limit') {
      return handleSetLimit(interaction);
    } else if (subcommand === 'blacklist') {
      return handleBlacklist(interaction);
    } else if (subcommand === 'whitelist') {
      return handleWhitelist(interaction);
    } else if (subcommand === 'private') {
      return handlePrivate(interaction);
    } else if (subcommand === 'rename') {
      return handleRename(interaction);
    }
  },
};

async function handleSetup(interaction) {
  // Check admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      embeds: [createPermissionDeniedEmbed()],
      ephemeral: true,
    });
  }
  
  try {
    const channel = interaction.options.getChannel('channel');
    const { setTempVCSetup } = require('../../utils/serverData');
    
    setTempVCSetup(interaction.guildId, channel.id);
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        '✅ Temp VC Setup',
        `${channel} is now the "Create VC" channel.\n\nWhen users join this channel, they'll get their own temporary voice channel.`
      )],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Temp VC setup error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred during setup.')],
      ephemeral: true,
    });
  }
}

async function handleSetOwner(interaction) {
  // Check if user is in temp VC
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  const newOwner = interaction.options.getUser('user');
  
  try {
    updateTempVC(interaction.guildId, interaction.member.voice.channel.id, {
      ownerId: newOwner.id,
    });
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        '✅ Owner Transferred',
        `${newOwner.tag} is now the owner of this temp VC.`
      )],
    });
  } catch (error) {
    console.error('Set owner error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handleSetLimit(interaction) {
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  const limit = interaction.options.getNumber('limit');
  
  try {
    await interaction.member.voice.channel.setUserLimit(limit);
    updateTempVC(interaction.guildId, interaction.member.voice.channel.id, {
      userLimit: limit,
    });
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        '✅ User Limit Set',
        `User limit set to **${limit === 0 ? 'Unlimited' : limit}**.`
      )],
    });
  } catch (error) {
    console.error('Set limit error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handleBlacklist(interaction) {
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice.channel;

  if (user.id === interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You cannot blacklist yourself from your own temp VC.')],
      ephemeral: true,
    });
  }

  if (user.id === tempVC.ownerId) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You cannot blacklist the current temp VC owner.')],
      ephemeral: true,
    });
  }
  
  try {
    if (!tempVC.blacklist) tempVC.blacklist = [];
    if (!tempVC.whitelist) tempVC.whitelist = [];

    // Blacklist and whitelist should not contain the same user.
    tempVC.whitelist = tempVC.whitelist.filter(id => id !== user.id);

    if (!tempVC.blacklist.includes(user.id)) {
      tempVC.blacklist.push(user.id);
      updateTempVC(interaction.guildId, channel.id, {
        blacklist: tempVC.blacklist,
        whitelist: tempVC.whitelist,
      });
    }

    await channel.permissionOverwrites.edit(user.id, {
      Connect: false,
      ViewChannel: false,
    });

    const targetMember = interaction.guild.members.cache.get(user.id)
      || await interaction.guild.members.fetch(user.id).catch(() => null);

    if (targetMember?.voice?.channelId === channel.id) {
      await targetMember.voice.disconnect('User blacklisted from temp VC').catch(() => null);
    }
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        '🚫 Blacklisted',
        `${user.tag} has been blocked from this temp VC.`
      )],
    });
  } catch (error) {
    console.error('Blacklist error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handleWhitelist(interaction) {
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice.channel;

  if (user.id === tempVC.ownerId) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'The owner already has access to this temp VC.')],
      ephemeral: true,
    });
  }
  
  try {
    if (!tempVC.whitelist) tempVC.whitelist = [];
    if (!tempVC.blacklist) tempVC.blacklist = [];

    if (tempVC.whitelist.includes(user.id)) {
      tempVC.whitelist = tempVC.whitelist.filter(id => id !== user.id);
      updateTempVC(interaction.guildId, channel.id, {
        whitelist: tempVC.whitelist,
        blacklist: tempVC.blacklist,
      });

      await channel.permissionOverwrites.delete(user.id).catch(() => null);
      
      interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Removed from Whitelist',
          `${user.tag} has been removed from the whitelist.`
        )],
      });
    } else {
      tempVC.blacklist = tempVC.blacklist.filter(id => id !== user.id);
      tempVC.whitelist.push(user.id);
      updateTempVC(interaction.guildId, channel.id, {
        whitelist: tempVC.whitelist,
        blacklist: tempVC.blacklist,
      });

      await channel.permissionOverwrites.edit(user.id, {
        Connect: true,
        ViewChannel: true,
      });
      
      interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Whitelisted',
          `${user.tag} can now join this temp VC.`
        )],
      });
    }
  } catch (error) {
    console.error('Whitelist error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handlePrivate(interaction) {
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  try {
    const newLocked = !tempVC.locked;
    await interaction.member.voice.channel.permissionOverwrites.create(
      interaction.guildId,
      { Connect: !newLocked }
    );
    
    updateTempVC(interaction.guildId, interaction.member.voice.channel.id, {
      locked: newLocked,
    });
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        newLocked ? '🔒 Locked' : '🔓 Unlocked',
        newLocked ? 'Channel is now private.' : 'Channel is now public.'
      )],
    });
  } catch (error) {
    console.error('Private error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred.')],
      ephemeral: true,
    });
  }
}

async function handleRename(interaction) {
  if (!interaction.member.voice.channel) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel.')],
      ephemeral: true,
    });
  }
  
  const { getTempVCs } = require('../../utils/serverData');
  const tempVCs = getTempVCs(interaction.guildId);
  const tempVC = tempVCs[interaction.member.voice.channel.id];
  
  if (!tempVC || tempVC.ownerId !== interaction.user.id) {
    return interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'You are not the owner of this temp VC.')],
      ephemeral: true,
    });
  }
  
  const newName = interaction.options.getString('name');
  
  try {
    await interaction.member.voice.channel.setName(newName);
    
    interaction.reply({
      embeds: [createSuccessEmbed(
        '✅ Channel Renamed',
        `Channel renamed to **${newName}**.`
      )],
    });
  } catch (error) {
    console.error('Rename error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred while renaming.')],
      ephemeral: true,
    });
  }
}
