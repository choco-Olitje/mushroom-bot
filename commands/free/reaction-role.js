const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const {
  normalizeReactionRoleEmoji,
  findMessageInGuild,
  getReactionRoleConfig,
  setReactionRoleConfig,
} = require('../../utils/reactionRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reaction-role')
    .setDescription('Create a reaction role message for this server')
    .addStringOption(option =>
      option
        .setName('message-id')
        .setDescription('The ID of the message users will react to')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('emoji')
        .setDescription('The emoji users should react with')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to assign when the emoji is used')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const messageId = interaction.options.getString('message-id', true).trim();
    const emojiInput = interaction.options.getString('emoji', true);
    const role = interaction.options.getRole('role', true);

    try {
      const parsedEmoji = normalizeReactionRoleEmoji(emojiInput);
      if (!parsedEmoji) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Invalid Emoji', 'Please provide a valid unicode emoji or custom server emoji.')],
          ephemeral: true,
        });
      }

      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Roles permission to assign reaction roles.')],
          ephemeral: true,
        });
      }

      if (role.managed) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Invalid Role', 'This role is managed by an integration and cannot be assigned automatically.')],
          ephemeral: true,
        });
      }

      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Role Too High', 'The selected role is higher than my highest role. Move it below my role and try again.')],
          ephemeral: true,
        });
      }

      const messageLookup = await findMessageInGuild(interaction.guild, messageId);
      if (!messageLookup) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Message Not Found', 'I could not find a message with that ID in this server.')],
          ephemeral: true,
        });
      }

      const { message, channel } = messageLookup;
      const channelPermissions = channel.permissionsFor(botMember);

      if (!channelPermissions || !channelPermissions.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
      ])) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', `I need View Channel, Read Message History, and Add Reactions in ${channel} to set up this reaction role.`)],
          ephemeral: true,
        });
      }

      if (interaction.guild.emojis.cache.has(parsedEmoji.emojiId || '')) {
        // Emoji exists in this guild, continue.
      } else if (parsedEmoji.isCustom) {
        const customEmoji = await interaction.guild.emojis.fetch(parsedEmoji.emojiId).catch(() => null);
        if (!customEmoji) {
          return interaction.reply({
            embeds: [createErrorEmbed('❌ Invalid Emoji', 'The custom emoji could not be found in this server.')],
            ephemeral: true,
          });
        }
      }

      const existingConfig = getReactionRoleConfig(interaction.guildId, message.id, parsedEmoji.emojiKey);
      if (existingConfig) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Duplicate Setup', 'A reaction role for that message and emoji already exists.')],
          ephemeral: true,
        });
      }

      await message.react(parsedEmoji.reactEmoji);

      setReactionRoleConfig(interaction.guildId, {
        messageId: message.id,
        channelId: channel.id,
        emojiKey: parsedEmoji.emojiKey,
        emojiId: parsedEmoji.emojiId,
        emojiName: parsedEmoji.emojiName,
        emojiAnimated: parsedEmoji.emojiAnimated,
        emojiDisplay: parsedEmoji.reactEmoji,
        roleId: role.id,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      });

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Reaction Role Created', 'Reaction role successfully configured.')],
        ephemeral: true,
      });
    } catch (error) {
      console.error('reaction-role command error:', error);

      const errorMessage = error?.code === 50013
        ? 'I do not have permission to react to that message or manage the selected role.'
        : 'An error occurred while creating the reaction role.';

      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', errorMessage)],
        ephemeral: true,
      });
    }
  },
};