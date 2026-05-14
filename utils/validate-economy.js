#!/usr/bin/env node

/**
 * Economy System Validator
 * Run this script to verify the economy system is properly installed
 * Usage: node utils/validate-economy.js
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'utils/economy.js',
  'commands/premium/balance.js',
  'commands/premium/free.js',
  'commands/premium/give-money.js',
  'commands/premium/work.js',
  'commands/premium/coin-flip.js',
  'ECONOMY_SYSTEM.md',
];

const REQUIRED_FUNCTIONS = {
  'utils/economy.js': [
    'getBalance',
    'setBalance',
    'addBalance',
    'removeBalance',
    'hasClaimedFree',
    'markFreeClaimed',
    'setCooldown',
    'getRemainingCooldown',
    'formatCooldown',
    'acquireLock',
    'releaseLock',
    'getRandomJob',
    'getRandomEarnings',
    'checkRobbery',
    'flipCoin',
    'handleCoinFlipButton',
  ],
};

let hasErrors = false;

console.log('🔍 Validating Economy System Setup...\n');

// Check required files
console.log('📁 Checking required files...');
REQUIRED_FILES.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    hasErrors = true;
  }
});

// Check required functions in economy.js
console.log('\n🔧 Checking economy.js exports...');
try {
  const economyModule = require('./economy');
  const requiredFunctions = REQUIRED_FUNCTIONS['utils/economy.js'];
  
  requiredFunctions.forEach(func => {
    if (typeof economyModule[func] === 'function') {
      console.log(`  ✅ ${func}`);
    } else {
      console.log(`  ❌ ${func} - NOT EXPORTED`);
      hasErrors = true;
    }
  });
} catch (error) {
  console.log(`  ❌ Failed to load economy.js: ${error.message}`);
  hasErrors = true;
}

// Check data directory
console.log('\n📂 Checking data directory...');
const dataDir = path.join(__dirname, '..', 'data');
if (fs.existsSync(dataDir)) {
  console.log(`  ✅ data/ directory exists`);
} else {
  console.log(`  ⚠️  data/ directory will be created on first use`);
}

// Results
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.log('❌ Validation FAILED - Please fix the issues above\n');
  process.exit(1);
} else {
  console.log('✅ Validation PASSED - Economy system is ready!\n');
  console.log('Next steps:');
  console.log('1. Ensure your bot has premium checks enabled');
  console.log('2. Test commands in a premium server');
  console.log('3. Check data/economy.json for stored balances');
  console.log('4. Review ECONOMY_SYSTEM.md for full documentation\n');
  process.exit(0);
}
