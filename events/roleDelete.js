const { removeReactionRoleConfigsForRole } = require('../utils/reactionRoles');
const { removeTempRoleAssignmentsForRole } = require('../utils/serverData');

module.exports = {
  name: 'roleDelete',
  async execute(role) {
    try {
      if (!role?.guild?.id || !role.id) {
        return;
      }

      removeReactionRoleConfigsForRole(role.guild.id, role.id);
      removeTempRoleAssignmentsForRole(role.guild.id, role.id);
    } catch (error) {
      console.error('roleDelete cleanup error:', error);
    }
  },
};