const { readData, writeData } = require('./database');
const { Collection } = require('discord.js');

// In-memory cooldown tracking for race condition prevention
const economyCooldowns = new Collection();
const transactionLock = new Collection();

// Cooldown constants
const WORK_COOLDOWN = 14400; // 4 hours
const COIN_FLIP_COOLDOWN = 120; // 2 minutes

// ============ DATA MANAGEMENT ============

/**
 * Get user's balance
 * @param {string} userId - User ID
 * @returns {number} User balance
 */
function getBalance(userId) {
  const balances = readData('economy', {});
  return balances[userId]?.balance || 0;
}

/**
 * Set user's balance (use with caution - for transactions use addBalance/removeBalance)
 * @param {string} userId - User ID
 * @param {number} amount - New balance
 */
function setBalance(userId, amount) {
  const balances = readData('economy', {});
  if (!balances[userId]) {
    balances[userId] = { balance: 0, freeClaimed: false };
  }
  balances[userId].balance = Math.max(0, amount);
  writeData('economy', balances);
}

/**
 * Add balance to user (handles transactions safely)
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add
 */
function addBalance(userId, amount) {
  const balances = readData('economy', {});
  if (!balances[userId]) {
    balances[userId] = { balance: 0, freeClaimed: false };
  }
  balances[userId].balance += amount;
  writeData('economy', balances);
}

/**
 * Remove balance from user
 * @param {string} userId - User ID
 * @param {number} amount - Amount to remove
 * @returns {boolean} Success
 */
function removeBalance(userId, amount) {
  const balances = readData('economy', {});
  if (!balances[userId]) {
    balances[userId] = { balance: 0, freeClaimed: false };
  }
  
  if (balances[userId].balance < amount) {
    return false;
  }
  
  balances[userId].balance -= amount;
  writeData('economy', balances);
  return true;
}

/**
 * Check if user has claimed free starter cash
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function hasClaimedFree(userId) {
  const balances = readData('economy', {});
  return balances[userId]?.freeClaimed || false;
}

/**
 * Mark free starter cash as claimed
 * @param {string} userId - User ID
 */
function markFreeClaimed(userId) {
  const balances = readData('economy', {});
  if (!balances[userId]) {
    balances[userId] = { balance: 0, freeClaimed: true };
  } else {
    balances[userId].freeClaimed = true;
  }
  writeData('economy', balances);
}

// ============ COOLDOWN MANAGEMENT ============

/**
 * Set cooldown for user-command pair
 * @param {string} userId - User ID
 * @param {string} commandName - Command name
 * @param {number} seconds - Cooldown duration in seconds
 */
function setCooldown(userId, commandName, seconds) {
  const key = `${userId}-${commandName}`;
  const expirationTime = Date.now() + seconds * 1000;
  economyCooldowns.set(key, expirationTime);
}

/**
 * Get remaining cooldown time
 * @param {string} userId - User ID
 * @param {string} commandName - Command name
 * @returns {number|null} Remaining seconds or null if no cooldown
 */
function getRemainingCooldown(userId, commandName) {
  const key = `${userId}-${commandName}`;
  const expirationTime = economyCooldowns.get(key);
  
  if (!expirationTime) {
    return null;
  }
  
  if (Date.now() > expirationTime) {
    economyCooldowns.delete(key);
    return null;
  }
  
  return Math.ceil((expirationTime - Date.now()) / 1000);
}

/**
 * Format cooldown time for display
 * @param {number} seconds - Remaining seconds
 * @returns {string} Formatted time (e.g., "2h 14m")
 */
function formatCooldown(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

// ============ TRANSACTION SAFETY ============

/**
 * Acquire lock for user transaction (prevents race conditions)
 * @param {string} userId - User ID
 * @returns {boolean} Lock acquired
 */
function acquireLock(userId) {
  if (transactionLock.has(userId)) {
    return false;
  }
  transactionLock.set(userId, Date.now());
  // Auto-release after 5 seconds to prevent deadlock
  setTimeout(() => transactionLock.delete(userId), 5000);
  return true;
}

/**
 * Release lock for user transaction
 * @param {string} userId - User ID
 */
function releaseLock(userId) {
  transactionLock.delete(userId);
}

// ============ JOBS FOR WORK COMMAND ============

const JOBS = [
  { name: 'Pizza Delivery', emoji: '🍕' },
  { name: 'Developer', emoji: '💻' },
  { name: 'Farmer', emoji: '🚜' },
  { name: 'Security Guard', emoji: '🔐' },
  { name: 'Streamer', emoji: '📹' },
  { name: 'Designer', emoji: '🎨' },
  { name: 'Uber Driver', emoji: '🚗' },
];

/**
 * Get random job
 * @returns {object} Job object
 */
function getRandomJob() {
  return JOBS[Math.floor(Math.random() * JOBS.length)];
}

/**
 * Generate random work earnings
 * @returns {number} Amount earned
 */
function getRandomEarnings() {
  // Random between $150 and $500
  return Math.floor(Math.random() * 350) + 150;
}

/**
 * Check if user gets robbed (5% chance)
 * @returns {boolean}
 */
function checkRobbery() {
  return Math.random() < 0.05; // 5% chance
}

// ============ COIN FLIP ============

/**
 * Simulate coin flip
 * @returns {string} 'heads' or 'tails'
 */
function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

/**
 * Handle coin flip button interaction
 * @param {Interaction} interaction - Button interaction
 */
async function handleCoinFlipButton(interaction) {
  const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('./embeds');
  const { ActionRowBuilder, ButtonBuilder } = require('discord.js');
  
  try {
    // Parse button ID: heads-{userId}-{betAmount} or tails-{userId}-{betAmount}
    const [userChoice, expectedUserId, betAmountStr] = interaction.customId.split('-');
    const betAmount = parseInt(betAmountStr);
    
    // Verify the user clicking is the one who initiated the coin flip
    if (interaction.user.id !== expectedUserId) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Not Your Flip',
          'You can only interact with your own coin flip!'
        )],
        ephemeral: true
      });
    }
    
    // Get the actual coin flip result
    const result = flipCoin();
    const won = result === userChoice;
    
    let embed;
    if (won) {
      const winnings = betAmount * 2;
      addBalance(interaction.user.id, winnings);
      embed = createSuccessEmbed(
        '🎉 You Won!',
        `The coin landed on **${result.toUpperCase()}**! 🪙\n\nYou won **$${winnings.toLocaleString()}**!\n\nNew balance: **$${getBalance(interaction.user.id).toLocaleString()}**`
      );
    } else {
      embed = createWarningEmbed(
        '😞 You Lost',
        `The coin landed on **${result.toUpperCase()}**! 🪙\n\nYou lost **$${betAmount.toLocaleString()}**.\n\nNew balance: **$${getBalance(interaction.user.id).toLocaleString()}**`
      );
    }
    
    // Set cooldown after result
    setCooldown(interaction.user.id, 'coin-flip', COIN_FLIP_COOLDOWN);
    
    // Disable all buttons for the result
    const disabledRow = new ActionRowBuilder().addComponents(
      interaction.message.components[0].components.map(btn => 
        ButtonBuilder.from(btn).setDisabled(true)
      )
    );
    
    // Update message with disabled buttons and result
    await interaction.update({
      embeds: [embed],
      components: [disabledRow]
    });
    
  } catch (error) {
    console.error('Error handling coin flip:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        embeds: [createErrorEmbed(
          '❌ Error',
          'An error occurred while processing your coin flip.'
        )],
        ephemeral: true
      });
    }
  }
}

module.exports = {
  // Balance management
  getBalance,
  setBalance,
  addBalance,
  removeBalance,
  hasClaimedFree,
  markFreeClaimed,
  
  // Cooldowns
  setCooldown,
  getRemainingCooldown,
  formatCooldown,
  
  // Transaction safety
  acquireLock,
  releaseLock,
  
  // Work command
  JOBS,
  getRandomJob,
  getRandomEarnings,
  checkRobbery,
  
  // Coin flip
  flipCoin,
  handleCoinFlipButton,
};
