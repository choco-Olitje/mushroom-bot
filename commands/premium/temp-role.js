const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const {
  getTempRoleAssignment,
  setTempRoleAssignment,
} = require('../../utils/serverData');
const {
  parseDuration,
  formatDuration,
  scheduleTempRoleExpiry,
} = require('../../utils/tempRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temp-role')
    .setDescription('[PREMIUM] Temporarily assign a role to a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to give the temporary role')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to temporarily assign')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription('Duration (e.g., "5 minutes", "2 hours", "1 day")')
        .setRequired(true)
    ),

  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }

    // Check admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const timeInput = interaction.options.getString('time', true);

    try {
      // Parse duration
      const durationMs = parseDuration(timeInput);
      if (!durationMs) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Invalid Duration', 'Please use a valid format like "5 minutes", "2 hours", or "1 day".')],
          ephemeral: true,
        });
      }

      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

      // Check bot permissions
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Roles permission to assign temporary roles.')],
          ephemeral: true,
        });
      }

      // Check if role is managed
      if (role.managed) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Invalid Role', 'This role is managed by an integration and cannot be assigned.')],
          ephemeral: true,
        });
      }

      // Check bot role hierarchy
      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Role Too High', 'The selected role is higher than my highest role. Move it below my role and try again.')],
          ephemeral: true,
        });
      }

      // Check admin role hierarchy
      if (role.position >= interaction.member.roles.highest.position) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Role Too High', 'You cannot assign a role equal to or higher than your highest role.')],
          ephemeral: true,
        });
      }

      // Fetch member
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Member Not Found', 'That user is not a member of this server.')],
          ephemeral: true,
        });
      }

      // Check for duplicate assignment
      const existing = getTempRoleAssignment(interaction.guildId, user.id, role.id);
      if (existing) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Already Assigned', `${user.tag} already has a temporary ${role} assignment.`)],
          ephemeral: true,
        });
      }

      // Assign role
      await member.roles.add(role);

      // Save assignment
      const expiresAt = Date.now() + durationMs;
      setTempRoleAssignment(interaction.guildId, {
        userId: user.id,
        roleId: role.id,
        guildId: interaction.guildId,
        expiresAt,
        assignedBy: interaction.user.id,
        assignedAt: new Date().toISOString(),
      });

      // Schedule expiry
      scheduleTempRoleExpiry(interaction.client, interaction.guildId, user.id, role.id, expiresAt);

      return interaction.reply({
        embeds: [createSuccessEmbed(
          '✅ Temp Role Assigned',
          `Successfully gave ${user.tag} the ${role} role for ${formatDuration(durationMs)}.`
        )],
        ephemeral: true,
      });
    } catch (error) {
      console.error('temp-role command error:', error);

      const errorMessage = error?.code === 50013
        ? 'I do not have permission to assign the selected role.'
        : 'An error occurred while assigning the temporary role.';

      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', errorMessage)],
        ephemeral: true,
      });
    }
  },
};
