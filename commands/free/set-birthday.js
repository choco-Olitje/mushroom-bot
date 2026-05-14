const { SlashCommandBuilder } = require('discord.js');
const { setBirthday } = require('../../utils/serverData');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-birthday')
    .setDescription('Set or update your birthday (dd/mm)')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Your birthday in dd/mm format (e.g. 21/09)')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const raw = interaction.options.getString('date');
      if (!raw) {
        return interaction.reply({ embeds: [createErrorEmbed('❌ Invalid', 'Date is required.')], ephemeral: true });
      }

      // Validate format dd/mm
      const match = /^([0-9]{1,2})\/([0-9]{1,2})$/.exec(raw.trim());
      if (!match) {
        return interaction.reply({ embeds: [createErrorEmbed('❌ Invalid Format', 'Please use the format `dd/mm` (e.g. 21/09).')], ephemeral: true });
      }

      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);

      if (month < 1 || month > 12) {
        return interaction.reply({ embeds: [createErrorEmbed('❌ Invalid Date', 'Month must be between 1 and 12.')], ephemeral: true });
      }

      const daysInMonth = [31, (/* Feb non-leap */ 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day < 1 || day > daysInMonth[month - 1]) {
        return interaction.reply({ embeds: [createErrorEmbed('❌ Invalid Date', 'That day does not exist for the chosen month.')], ephemeral: true });
      }

      // Save birthday per server
      setBirthday(interaction.guildId, interaction.user.id, day, month, raw.trim());

      interaction.reply({ embeds: [createSuccessEmbed('✅ Birthday Set', `Your birthday has been set to **${raw.trim()}**`)], ephemeral: true });
    } catch (error) {
      console.error('Set-birthday command error:', error);
      interaction.reply({ embeds: [createErrorEmbed('❌ Error', 'An error occurred while setting your birthday.')], ephemeral: true });
    }
  },
};
