const { removeReactionRoleConfigsForMessage } = require('../utils/reactionRoles');
const { handleMessageDelete } = require('../utils/starboard');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    try {
      if (!message?.guild?.id || !message.id) {
        return;
      }

      removeReactionRoleConfigsForMessage(message.guild.id, message.id);
      
      // Handle starboard cleanup
      await handleMessageDelete(message, client);
    } catch (error) {
      console.error('messageDelete cleanup error:', error);
    }
  },
};