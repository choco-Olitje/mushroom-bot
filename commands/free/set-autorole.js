const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed, createPermissionDeniedEmbed } = require('../../utils/embeds');
const { setAutoRoleConfig, getAutoRoleConfig } = require('../../utils/serverData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-autorole')
    .setDescription('Set a role to automatically assign to new members')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Role to assign to new members')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createPermissionDeniedEmbed()],
        ephemeral: true,
      });
    }

    const role = interaction.options.getRole('role', true);

    try {
      const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
          embeds: [createErrorEmbed('❌ Missing Permissions', 'I need the Manage Roles permission to assign auto-roles.')],
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

      setAutoRoleConfig(interaction.guildId, { roleId: role.id });
      const config = getAutoRoleConfig(interaction.guildId);

      return interaction.reply({
        embeds: [createSuccessEmbed('✅ Auto-Role Set', `New members will now receive ${role} automatically.\n\n**Role:** <@&${config.roleId}>`)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('set-autorole command error:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting the auto-role.')],
        ephemeral: true,
      });
    }
  },
};