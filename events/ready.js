const { ActivityType } = require('discord.js');
const birthdayUtil = require('../utils/birthday');
const giveawayUtil = require('../utils/giveaways');
const reactionRoleUtil = require('../utils/reactionRoles');
const tempRoleUtil = require('../utils/tempRoles');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    
    // Set bot status
    client.user.setActivity('Mushroomsss', { type: ActivityType.Playing });
    // Initialize birthday system (schedules daily checks and pending removals)
    birthdayUtil.init(client).catch(err => console.error('Birthday init error:', err));
    giveawayUtil.initGiveaways(client).catch(err => console.error('Giveaway init error:', err));
    reactionRoleUtil.cleanupStaleReactionRoles(client).then(removedCount => {
      if (removedCount > 0) {
        console.log(`🧹 Reaction role cleanup removed ${removedCount} stale configuration(s).`);
      }
    }).catch(err => console.error('Reaction role cleanup error:', err));
    tempRoleUtil.initTempRoles(client).catch(err => console.error('Temp role init error:', err));
    
    console.log(`👑 Connected to ${client.guilds.cache.size} server(s)`);
  },
};
