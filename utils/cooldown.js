const { Collection } = require('discord.js');

const cooldowns = new Collection();

// Set cooldown for command
function setCooldown(userId, commandName, seconds) {
  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Collection());
  }
  
  const now = Date.now();
  const expirationTime = now + seconds * 1000;
  
  cooldowns.get(commandName).set(userId, expirationTime);
}

// Check cooldown
function getCooldown(userId, commandName) {
  const commandCooldowns = cooldowns.get(commandName);
  
  if (!commandCooldowns) {
    return null;
  }
  
  const expirationTime = commandCooldowns.get(userId);
  
  if (!expirationTime) {
    return null;
  }
  
  if (Date.now() > expirationTime) {
    commandCooldowns.delete(userId);
    return null;
  }
  
  return Math.ceil((expirationTime - Date.now()) / 1000);
}

// Check if user is on cooldown
function isOnCooldown(userId, commandName) {
  return getCooldown(userId, commandName) !== null;
}

module.exports = {
  setCooldown,
  getCooldown,
  isOnCooldown,
};
