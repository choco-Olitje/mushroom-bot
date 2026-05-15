const { getServerData, setServerData } = require('./serverData');

const DEFAULT_AUTOMOD = {
  enabled: false,
  logChannelId: null,
  punishment: 'delete',
  protection: {
    antiSpam: true,
    antiLinks: false,
    antiInvites: true,
    antiMassMentions: true,
    antiCapsSpam: false,
    duplicateMessages: true,
    antiRaid: false,
    bannedWords: false,
  },
  bannedWords: [],
  updatedAt: null,
  updatedBy: null,
};

function getAutomodConfig(guildId) {
  const serverData = getServerData(guildId) || {};
  const saved = serverData.automod || {};

  return {
    ...DEFAULT_AUTOMOD,
    ...saved,
    protection: {
      ...DEFAULT_AUTOMOD.protection,
      ...(saved.protection || {}),
    },
    bannedWords: Array.isArray(saved.bannedWords) ? saved.bannedWords : [],
  };
}

function setAutomodConfig(guildId, patch = {}) {
  const current = getAutomodConfig(guildId);
  const next = {
    ...current,
    ...patch,
    protection: {
      ...current.protection,
      ...((patch && patch.protection) || {}),
    },
    updatedAt: new Date().toISOString(),
    updatedBy: patch.updatedBy || current.updatedBy || null,
  };

  setServerData(guildId, { automod: next });
  return next;
}

function disableAutomod(guildId, updatedBy = null) {
  return setAutomodConfig(guildId, { enabled: false, updatedBy });
}

function enableAutomod(guildId, updatedBy = null) {
  return setAutomodConfig(guildId, { enabled: true, updatedBy });
}

function addBannedWords(guildId, words = [], updatedBy = null) {
  const current = getAutomodConfig(guildId);
  const normalized = words
    .map(word => String(word || '').trim().toLowerCase())
    .filter(Boolean);
  const merged = [...new Set([...current.bannedWords, ...normalized])];
  return setAutomodConfig(guildId, { bannedWords: merged, updatedBy });
}

function removeBannedWords(guildId, words = [], updatedBy = null) {
  const current = getAutomodConfig(guildId);
  const toRemove = new Set(
    words
      .map(word => String(word || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const filtered = current.bannedWords.filter(word => !toRemove.has(word));
  return setAutomodConfig(guildId, { bannedWords: filtered, updatedBy });
}

module.exports = {
  DEFAULT_AUTOMOD,
  getAutomodConfig,
  setAutomodConfig,
  disableAutomod,
  enableAutomod,
  addBannedWords,
  removeBannedWords,
};
