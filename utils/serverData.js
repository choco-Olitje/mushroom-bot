const { readData, writeData } = require('./database');

// Get server data
function getServerData(serverId) {
  const allServers = readData('servers', {});
  return allServers[serverId] || null;
}

// Set server data
function setServerData(serverId, data) {
  const allServers = readData('servers', {});
  allServers[serverId] = { ...allServers[serverId], ...data };
  writeData('servers', allServers);
}

// Get user data in server
function getUserData(serverId, userId) {
  const serverData = getServerData(serverId) || {};
  const users = serverData.users || {};
  return users[userId] || null;
}

// Set user data in server
function setUserData(serverId, userId, data) {
  let serverData = getServerData(serverId) || { users: {} };
  if (!serverData.users) serverData.users = {};
  
  serverData.users[userId] = { ...serverData.users[userId], ...data };
  setServerData(serverId, serverData);
}

// Calculate required XP for next level
function getRequiredXP(level) {
  return 400 + (level * 100);
}

// Calculate level from total XP
function getLevelFromTotalXP(totalXP) {
  let level = 0;
  let xpNeeded = 0;
  
  while (xpNeeded + getRequiredXP(level) <= totalXP) {
    xpNeeded += getRequiredXP(level);
    level += 1;
  }
  
  return { level, totalXPForLevel: xpNeeded };
}

// Get user level in server
function getUserLevel(serverId, userId) {
  const userData = getUserData(serverId, userId) || { totalXP: 0 };
  const totalXP = userData.totalXP || 0;
  return getLevelFromTotalXP(totalXP).level;
}

// Get user XP in server
function getUserXP(serverId, userId) {
  const userData = getUserData(serverId, userId) || { totalXP: 0 };
  const totalXP = userData.totalXP || 0;
  const { level, totalXPForLevel } = getLevelFromTotalXP(totalXP);
  return totalXP - totalXPForLevel;
}

// Get total XP
function getTotalUserXP(serverId, userId) {
  const userData = getUserData(serverId, userId) || { totalXP: 0 };
  return userData.totalXP || 0;
}

// Add XP to user
function addUserXP(serverId, userId, amount) {
  const userData = getUserData(serverId, userId) || { totalXP: 0, messages: 0 };
  const oldLevel = getLevelFromTotalXP(userData.totalXP || 0).level;
  const newTotalXP = (userData.totalXP || 0) + amount;
  const newLevelData = getLevelFromTotalXP(newTotalXP);
  const newLevel = newLevelData.level;
  
  userData.totalXP = newTotalXP;
  userData.messages = (userData.messages || 0) + 1;
  
  setUserData(serverId, userId, userData);
  
  const currentLevelXP = newTotalXP - newLevelData.totalXPForLevel;
  const requiredForNext = getRequiredXP(newLevel);
  
  return { 
    level: newLevel, 
    xp: currentLevelXP,
    totalXP: newTotalXP,
    requiredForNext,
    leveledUp: newLevel > oldLevel 
  };
}

// Set counting channel
function setCountingChannel(serverId, channelId) {
  setServerData(serverId, { countingChannel: channelId, countingNumber: 0, lastCounter: null });
}

// Get counting channel
function getCountingChannel(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.countingChannel || null;
}

// Get counting number
function getCountingNumber(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.countingNumber || 0;
}

// Set counting number
function setCountingNumber(serverId, number) {
  setServerData(serverId, { countingNumber: number });
}

// Get last counter
function getLastCounter(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.lastCounter || null;
}

// Set last counter
function setLastCounter(serverId, userId) {
  setServerData(serverId, { lastCounter: userId });
}

// Get temp VC setup channel
function getTempVCSetup(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.tempVCSetup || null;
}

// Set temp VC setup channel
function setTempVCSetup(serverId, channelId) {
  setServerData(serverId, { tempVCSetup: channelId, tempVCs: {} });
}

// Get temp VCs
function getTempVCs(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.tempVCs || {};
}

// Add temp VC
function addTempVC(serverId, channelId, ownerId, options = {}) {
  let serverData = getServerData(serverId) || { tempVCs: {} };
  if (!serverData.tempVCs) serverData.tempVCs = {};
  
  serverData.tempVCs[channelId] = {
    ownerId,
    createdAt: new Date().getTime(),
    userLimit: options.userLimit || 0,
    locked: options.locked || false,
    blacklist: options.blacklist || [],
    whitelist: options.whitelist || [],
    ...options,
  };
  
  setServerData(serverId, serverData);
}

// Remove temp VC
function removeTempVC(serverId, channelId) {
  let serverData = getServerData(serverId) || { tempVCs: {} };
  if (!serverData.tempVCs) serverData.tempVCs = {};
  
  delete serverData.tempVCs[channelId];
  setServerData(serverId, serverData);
}

// Update temp VC
function updateTempVC(serverId, channelId, data) {
  let serverData = getServerData(serverId) || { tempVCs: {} };
  if (!serverData.tempVCs) serverData.tempVCs = {};
  
  if (serverData.tempVCs[channelId]) {
    serverData.tempVCs[channelId] = { ...serverData.tempVCs[channelId], ...data };
    setServerData(serverId, serverData);
  }
}

// Get XP multiplier
function getXPMultiplier(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.xpMultiplier || 1;
}

// Set XP multiplier
function setXPMultiplier(serverId, multiplier) {
  setServerData(serverId, { xpMultiplier: Math.min(multiplier, 3) });
}

// -------------------- Birthday utilities --------------------

function setBirthday(serverId, userId, day, month, raw) {
  let serverData = getServerData(serverId) || {};
  if (!serverData.birthdays) serverData.birthdays = {};

  serverData.birthdays[userId] = { day, month, raw };
  setServerData(serverId, serverData);
}

function getBirthday(serverId, userId) {
  const serverData = getServerData(serverId) || {};
  return (serverData.birthdays && serverData.birthdays[userId]) || null;
}

function getAllBirthdays(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.birthdays || {};
}

function getBirthdaysForDate(serverId, day, month) {
  const birthdays = getAllBirthdays(serverId);
  const result = [];
  for (const [userId, info] of Object.entries(birthdays)) {
    if (Number(info.day) === Number(day) && Number(info.month) === Number(month)) {
      result.push({ userId, ...info });
    }
  }
  return result;
}

function setBirthdayConfig(serverId, config = {}) {
  // config: { channelId, roleId }
  const serverData = getServerData(serverId) || {};
  serverData.birthdayConfig = { ...serverData.birthdayConfig, ...config };
  setServerData(serverId, serverData);
}

function getBirthdayConfig(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.birthdayConfig || { channelId: null, roleId: null };
}

function addBirthdayRoleAssignment(serverId, userId, roleId, expiresAt) {
  const serverData = getServerData(serverId) || {};
  if (!serverData.birthdayRoleAssignments) serverData.birthdayRoleAssignments = {};
  serverData.birthdayRoleAssignments[userId] = { roleId, expiresAt };
  setServerData(serverId, serverData);
}

function removeBirthdayRoleAssignment(serverId, userId) {
  const serverData = getServerData(serverId) || {};
  if (!serverData.birthdayRoleAssignments) return;
  delete serverData.birthdayRoleAssignments[userId];
  setServerData(serverId, serverData);
}

function getBirthdayRoleAssignments(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.birthdayRoleAssignments || {};
}

// -------------------- Welcome utilities --------------------

function setWelcomeConfig(serverId, config = {}) {
  const serverData = getServerData(serverId) || {};
  serverData.welcomeConfig = { ...serverData.welcomeConfig, ...config };
  setServerData(serverId, serverData);
}

function getWelcomeConfig(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.welcomeConfig || { channelId: null };
}

function removeWelcomeConfig(serverId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.welcomeConfig) return;

  const { welcomeConfig, ...updatedServerData } = serverData;
  allServers[serverId] = updatedServerData;
  writeData('servers', allServers);
}

// -------------------- Auto-role utilities --------------------

function setAutoRoleConfig(serverId, config = {}) {
  const serverData = getServerData(serverId) || {};
  serverData.autoRoleConfig = { ...serverData.autoRoleConfig, ...config };
  setServerData(serverId, serverData);
}

function getAutoRoleConfig(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.autoRoleConfig || { roleId: null };
}

function removeAutoRoleConfig(serverId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.autoRoleConfig) return;

  const { autoRoleConfig, ...updatedServerData } = serverData;
  allServers[serverId] = updatedServerData;
  writeData('servers', allServers);
}

// -------------------- Reaction role utilities --------------------

function createReactionRoleKey(messageId, emojiKey) {
  return `${messageId}:${emojiKey}`;
}

function normalizeReactionRoleEmoji(emojiInput) {
  if (!emojiInput || typeof emojiInput !== 'string') {
    return null;
  }

  const trimmed = emojiInput.trim();
  if (!trimmed) {
    return null;
  }

  const customEmojiMatch = trimmed.match(/^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/);

  if (customEmojiMatch) {
    const animated = customEmojiMatch[1] === 'a';
    const emojiName = customEmojiMatch[2];
    const emojiId = customEmojiMatch[3];

    return {
      reactEmoji: trimmed,
      emojiKey: emojiId,
      emojiId,
      emojiName,
      emojiAnimated: animated,
      isCustom: true,
    };
  }

  return {
    reactEmoji: trimmed,
    emojiKey: trimmed,
    emojiId: null,
    emojiName: trimmed,
    emojiAnimated: false,
    isCustom: false,
  };
}

function getReactionRoleConfigs(serverId) {
  const serverData = getServerData(serverId) || {};
  const reactionRoles = serverData.reactionRoles || {};

  return Object.entries(reactionRoles).map(([reactionRoleKey, config]) => ({
    reactionRoleKey,
    ...config,
  }));
}

function getReactionRoleConfig(serverId, messageId, emojiKey) {
  const serverData = getServerData(serverId) || {};
  const reactionRoles = serverData.reactionRoles || {};
  return reactionRoles[createReactionRoleKey(messageId, emojiKey)] || null;
}

function setReactionRoleConfig(serverId, config) {
  if (!config?.messageId || !config?.emojiKey || !config?.roleId) {
    throw new Error('A reaction role config requires messageId, emojiKey, and roleId.');
  }

  const serverData = getServerData(serverId) || {};
  if (!serverData.reactionRoles) serverData.reactionRoles = {};

  const reactionRoleKey = config.reactionRoleKey || createReactionRoleKey(config.messageId, config.emojiKey);

  serverData.reactionRoles[reactionRoleKey] = {
    ...serverData.reactionRoles[reactionRoleKey],
    ...config,
    reactionRoleKey,
  };

  setServerData(serverId, serverData);
  return serverData.reactionRoles[reactionRoleKey];
}

function removeReactionRoleConfig(serverId, messageId, emojiKey) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.reactionRoles) return;

  const reactionRoleKey = createReactionRoleKey(messageId, emojiKey);
  if (!serverData.reactionRoles[reactionRoleKey]) return;

  const updatedReactionRoles = { ...serverData.reactionRoles };
  delete updatedReactionRoles[reactionRoleKey];

  allServers[serverId] = {
    ...serverData,
    reactionRoles: updatedReactionRoles,
  };

  writeData('servers', allServers);
}

function removeReactionRoleConfigsForMessage(serverId, messageId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.reactionRoles) return;

  const updatedReactionRoles = Object.fromEntries(
    Object.entries(serverData.reactionRoles).filter(([, config]) => config.messageId !== messageId)
  );

  if (Object.keys(updatedReactionRoles).length === Object.keys(serverData.reactionRoles).length) {
    return;
  }

  allServers[serverId] = {
    ...serverData,
    reactionRoles: updatedReactionRoles,
  };

  writeData('servers', allServers);
}

function removeReactionRoleConfigsForRole(serverId, roleId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.reactionRoles) return;

  const updatedReactionRoles = Object.fromEntries(
    Object.entries(serverData.reactionRoles).filter(([, config]) => config.roleId !== roleId)
  );

  if (Object.keys(updatedReactionRoles).length === Object.keys(serverData.reactionRoles).length) {
    return;
  }

  allServers[serverId] = {
    ...serverData,
    reactionRoles: updatedReactionRoles,
  };

  writeData('servers', allServers);
}

module.exports = {
  getServerData,
  setServerData,
  getUserData,
  setUserData,
  getUserLevel,
  getUserXP,
  getTotalUserXP,
  addUserXP,
  setCountingChannel,
  getCountingChannel,
  getCountingNumber,
  setCountingNumber,
  getLastCounter,
  setLastCounter,
  getTempVCSetup,
  setTempVCSetup,
  getTempVCs,
  addTempVC,
  removeTempVC,
  updateTempVC,
  getXPMultiplier,
  setXPMultiplier,
  // birthdays
  setBirthday,
  getBirthday,
  getAllBirthdays,
  getBirthdaysForDate,
  setBirthdayConfig,
  getBirthdayConfig,
  addBirthdayRoleAssignment,
  removeBirthdayRoleAssignment,
  getBirthdayRoleAssignments,
};

// -------------------- Sticky message utilities --------------------

function setStickyConfig(serverId, channelId, config) {
  // config: { title, content, messageId }
  let serverData = getServerData(serverId) || {};
  if (!serverData.stickyMessages) serverData.stickyMessages = {};

  serverData.stickyMessages[channelId] = { ...serverData.stickyMessages[channelId], ...config };
  setServerData(serverId, serverData);
}

function getStickyConfig(serverId, channelId) {
  const serverData = getServerData(serverId) || {};
  return (serverData.stickyMessages && serverData.stickyMessages[channelId]) || null;
}

function getAllStickyConfigs(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.stickyMessages || {};
}

function removeStickyConfig(serverId, channelId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.stickyMessages || !serverData.stickyMessages[channelId]) return;

  const updatedStickyMessages = { ...serverData.stickyMessages };
  delete updatedStickyMessages[channelId];

  allServers[serverId] = {
    ...serverData,
    stickyMessages: updatedStickyMessages,
  };

  writeData('servers', allServers);
}

// -------------------- Temp role utilities --------------------

function getTempRoleAssignments(serverId) {
  const serverData = getServerData(serverId) || {};
  const tempRoles = serverData.tempRoles || {};

  return Object.entries(tempRoles).map(([key, assignment]) => ({
    assignmentKey: key,
    ...assignment,
  }));
}

function createTempRoleKey(userId, roleId) {
  return `${userId}:${roleId}`;
}

function getTempRoleAssignment(serverId, userId, roleId) {
  const serverData = getServerData(serverId) || {};
  const tempRoles = serverData.tempRoles || {};
  return tempRoles[createTempRoleKey(userId, roleId)] || null;
}

function setTempRoleAssignment(serverId, assignment) {
  if (!assignment?.userId || !assignment?.roleId) {
    throw new Error('A temp role assignment requires userId and roleId.');
  }

  const serverData = getServerData(serverId) || {};
  if (!serverData.tempRoles) serverData.tempRoles = {};

  const assignmentKey = assignment.assignmentKey || createTempRoleKey(assignment.userId, assignment.roleId);

  serverData.tempRoles[assignmentKey] = {
    ...serverData.tempRoles[assignmentKey],
    ...assignment,
    assignmentKey,
  };

  setServerData(serverId, serverData);
  return serverData.tempRoles[assignmentKey];
}

function removeTempRoleAssignment(serverId, userId, roleId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.tempRoles) return;

  const assignmentKey = createTempRoleKey(userId, roleId);
  if (!serverData.tempRoles[assignmentKey]) return;

  const updatedTempRoles = { ...serverData.tempRoles };
  delete updatedTempRoles[assignmentKey];

  allServers[serverId] = {
    ...serverData,
    tempRoles: updatedTempRoles,
  };

  writeData('servers', allServers);
}

function removeTempRoleAssignmentsForRole(serverId, roleId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.tempRoles) return;

  const updatedTempRoles = Object.fromEntries(
    Object.entries(serverData.tempRoles).filter(([, assignment]) => assignment.roleId !== roleId)
  );

  if (Object.keys(updatedTempRoles).length === Object.keys(serverData.tempRoles).length) {
    return;
  }

  allServers[serverId] = {
    ...serverData,
    tempRoles: updatedTempRoles,
  };

  writeData('servers', allServers);
}

function removeTempRoleAssignmentsForUser(serverId, userId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.tempRoles) return;

  const updatedTempRoles = Object.fromEntries(
    Object.entries(serverData.tempRoles).filter(([, assignment]) => assignment.userId !== userId)
  );

  if (Object.keys(updatedTempRoles).length === Object.keys(serverData.tempRoles).length) {
    return;
  }

  allServers[serverId] = {
    ...serverData,
    tempRoles: updatedTempRoles,
  };

  writeData('servers', allServers);
}

// -------------------- Starboard utilities --------------------

function setStarboardConfig(serverId, config = {}) {
  // config: { channelId, requiredStars }
  const serverData = getServerData(serverId) || {};
  serverData.starboardConfig = { ...serverData.starboardConfig, ...config };
  setServerData(serverId, serverData);
}

function getStarboardConfig(serverId) {
  const serverData = getServerData(serverId) || {};
  return serverData.starboardConfig || { channelId: null, requiredStars: null };
}

function removeStarboardConfig(serverId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.starboardConfig) return;

  const { starboardConfig, ...updatedServerData } = serverData;
  allServers[serverId] = updatedServerData;
  writeData('servers', allServers);
}

function getStarboardEntry(serverId, originalMessageId) {
  const serverData = getServerData(serverId) || {};
  const starboard = serverData.starboard || {};
  return starboard[originalMessageId] || null;
}

function setStarboardEntry(serverId, originalMessageId, entry) {
  let serverData = getServerData(serverId) || { starboard: {} };
  if (!serverData.starboard) serverData.starboard = {};

  serverData.starboard[originalMessageId] = {
    ...serverData.starboard[originalMessageId],
    ...entry,
  };

  setServerData(serverId, serverData);
}

function removeStarboardEntry(serverId, originalMessageId) {
  const allServers = readData('servers', {});
  const serverData = allServers[serverId];
  if (!serverData || !serverData.starboard || !serverData.starboard[originalMessageId]) return;

  const updatedStarboard = { ...serverData.starboard };
  delete updatedStarboard[originalMessageId];

  allServers[serverId] = {
    ...serverData,
    starboard: updatedStarboard,
  };

  writeData('servers', allServers);
}

module.exports = {
  getServerData,
  setServerData,
  getUserData,
  setUserData,
  getUserLevel,
  getUserXP,
  getTotalUserXP,
  addUserXP,
  setCountingChannel,
  getCountingChannel,
  getCountingNumber,
  setCountingNumber,
  getLastCounter,
  setLastCounter,
  getTempVCSetup,
  setTempVCSetup,
  getTempVCs,
  addTempVC,
  removeTempVC,
  updateTempVC,
  getXPMultiplier,
  setXPMultiplier,
  // birthdays
  setBirthday,
  getBirthday,
  getAllBirthdays,
  getBirthdaysForDate,
  setBirthdayConfig,
  getBirthdayConfig,
  addBirthdayRoleAssignment,
  removeBirthdayRoleAssignment,
  getBirthdayRoleAssignments,
  // welcome
  setWelcomeConfig,
  getWelcomeConfig,
  removeWelcomeConfig,
  // auto-role
  setAutoRoleConfig,
  getAutoRoleConfig,
  removeAutoRoleConfig,
  // reaction roles
  createReactionRoleKey,
  normalizeReactionRoleEmoji,
  getReactionRoleConfigs,
  getReactionRoleConfig,
  setReactionRoleConfig,
  removeReactionRoleConfig,
  removeReactionRoleConfigsForMessage,
  removeReactionRoleConfigsForRole,
  // sticky messages
  setStickyConfig,
  getStickyConfig,
  getAllStickyConfigs,
  removeStickyConfig,
  // temp roles
  getTempRoleAssignments,
  createTempRoleKey,
  getTempRoleAssignment,
  setTempRoleAssignment,
  removeTempRoleAssignment,
  removeTempRoleAssignmentsForRole,
  removeTempRoleAssignmentsForUser,
  // starboard
  setStarboardConfig,
  getStarboardConfig,
  removeStarboardConfig,
  getStarboardEntry,
  setStarboardEntry,
  removeStarboardEntry,
};


