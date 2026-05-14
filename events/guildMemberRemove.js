const { removeTempRoleAssignmentsForUser } = require('../utils/serverData');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      if (!member?.guild?.id || !member.id) {
        return;
      }

      removeTempRoleAssignmentsForUser(member.guild.id, member.id);
    } catch (error) {
      console.error('guildMemberRemove cleanup error:', error);
    }
  },
};
