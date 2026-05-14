const { handleReactionRoleAdd } = require('../utils/reactionRoles');
const { handleStarReactionAdd } = require('../utils/starboard');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    try {
      // Handle reaction roles
      await handleReactionRoleAdd(reaction, user);
      
      // Handle starboard
      await handleStarReactionAdd(reaction, user, client);
    } catch (error) {
      console.error('messageReactionAdd error:', error);
    }
  },
};