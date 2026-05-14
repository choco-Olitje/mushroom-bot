const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const config = require('./config');
const Stripe = require('stripe');
const { handleStripeWebhook } = require('./utils/premium');

const stripe = new Stripe(config.stripe.secretKey);
const app = express();

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
});

// Initialize command collection
client.commands = new Collection();

// Load commands
const loadCommands = () => {
  const commandsPath = path.join(__dirname, 'commands');
  const commandCategories = fs.readdirSync(commandsPath);
  
  console.log('📂 Loading commands...');
  
  for (const category of commandCategories) {
    const categoryPath = path.join(commandsPath, category);
    const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
      const filePath = path.join(categoryPath, file);
      try {
        const command = require(filePath);
        if (command.data && command.execute) {
          client.commands.set(command.data.name, command);
          console.log(`  ✅ Loaded: ${command.data.name} (${category})`);
        }
      } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
      }
    }
  }
  
  console.log(`✅ Loaded ${client.commands.size} commands\n`);
};

// Load events
const loadEvents = () => {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  
  console.log('📂 Loading events...');
  
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (event.name && event.execute) {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args));
        } else {
          client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`  ✅ Loaded: ${event.name}`);
      }
    } catch (error) {
      console.error(`❌ Error loading event ${file}:`, error);
    }
  }
  
  console.log(`✅ Loaded ${eventFiles.length} events\n`);
};

// Register slash commands
const registerCommands = async () => {
  try {
    console.log('🔄 Registering slash commands with Discord...');
    
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    
    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands }
    );
    
    console.log(`✅ Successfully registered ${data.length} slash commands\n`);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
};

// Initialize bot
async function initialize() {
  console.log('🚀 Starting Ultimate Discord Bot...\n');
  
  loadCommands();
  loadEvents();

  // Stripe webhook endpoint for subscription events
  app.get('/health', (_req, res) => {
    res.status(200).send('ok');
  });

  app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).send('Missing Stripe signature');
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    handleStripeWebhook(event);
    return res.status(200).json({ received: true });
  });

  app.listen(config.server.port, () => {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${config.server.port}`;
    console.log(`🌐 Stripe webhook endpoint ready: ${publicBaseUrl}/webhook`);
    console.log(`🩺 Health check: ${publicBaseUrl}/health\n`);
  });
  
  try {
    await registerCommands();
    await client.login(config.discord.token);
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle process errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start bot
initialize();

module.exports = client;
