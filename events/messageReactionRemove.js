const { handleReactionRoleRemove } = require('../utils/reactionRoles');
const { handleStarReactionRemove } = require('../utils/starboard');

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client) {
    try {
      // Handle reaction roles
      await handleReactionRoleRemove(reaction, user);
      
      // Handle starboard
      await handleStarReactionRemove(reaction, user, client);
    } catch (error) {
      console.error('messageReactionRemove error:', error);
    }
  },
};