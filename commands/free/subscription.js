const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isPremium, createCheckoutSession, cancelUserSubscription, getPremiumStatus } = require('../../utils/premium');
const { createSuccessEmbed, createErrorEmbed, createInfoEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('subscription')
    .setDescription('Manage your premium subscription')
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Purchase premium for your server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check your subscription status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel your subscription')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('renew')
        .setDescription('Renew your subscription if it expired')
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'buy') {
      return handleBuy(interaction);
    } else if (subcommand === 'status') {
      return handleStatus(interaction);
    } else if (subcommand === 'cancel') {
      return handleCancel(interaction);
    } else if (subcommand === 'renew') {
      return handleRenew(interaction);
    }
  },
};

async function handleBuy(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const session = await createCheckoutSession(
      interaction.guildId,
      interaction.user.id,
      interaction.guild.name
    );
    
    interaction.editReply({
      embeds: [createSuccessEmbed(
        '✅ Checkout Link Generated',
        `[Click here to proceed with payment](${session.url})\n\nThis link is valid for 24 hours.`
      )],
    });
  } catch (error) {
    console.error('Subscription buy error:', error);
    interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'Failed to create checkout session. Please try again later.')],
    });
  }
}

async function handleStatus(interaction) {
  const premiumStatus = getPremiumStatus(interaction.guildId);
  
  let statusText = premiumStatus.premium ? '✅ Active' : '❌ Inactive';
  let description = `**Premium Status:** ${statusText}\n\n`;
  
  if (premiumStatus.premium) {
    const expiryDate = new Date(premiumStatus.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    description += `**Server:** ${interaction.guild.name}\n`;
    description += `**Expires:** ${expiryDate.toLocaleDateString()}\n`;
    description += `**Days Remaining:** ${daysLeft}\n`;
    description += `**Plan:** Monthly Recurring\n`;
  } else {
    description += `Your server does not have an active premium subscription.\n\nUse \`/subscription buy\` to upgrade!`;
  }
  
  interaction.reply({
    embeds: [createInfoEmbed('📊 Subscription Status', description)],
    ephemeral: true,
  });
}

async function handleCancel(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const premiumStatus = getPremiumStatus(interaction.guildId);
    
    if (!premiumStatus.premium) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'This server does not have an active subscription.')],
      });
    }
    
    // Check if user is server owner
    if (interaction.user.id !== interaction.guild.ownerId && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Permission Denied', 'Only the server owner or administrator can cancel the subscription.')],
      });
    }
    
    await cancelUserSubscription(interaction.user.id, interaction.guildId);
    
    const expiryDate = new Date(premiumStatus.expiresAt);
    
    interaction.editReply({
      embeds: [createSuccessEmbed(
        '✅ Subscription Canceled',
        `Your subscription has been canceled.\n\nPremium features remain active until **${expiryDate.toLocaleDateString()}**.`
      )],
    });
  } catch (error) {
    console.error('Subscription cancel error:', error);
    interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'Failed to cancel subscription. Please try again.')],
    });
  }
}

async function handleRenew(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const premiumStatus = getPremiumStatus(interaction.guildId);
    
    if (premiumStatus.premium) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'Your subscription is still active.')],
      });
    }
    
    const session = await createCheckoutSession(
      interaction.guildId,
      interaction.user.id,
      interaction.guild.name
    );
    
    interaction.editReply({
      embeds: [createSuccessEmbed(
        '✅ Renewal Link Generated',
        `[Click here to renew your subscription](${session.url})\n\nThis link is valid for 24 hours.`
      )],
    });
  } catch (error) {
    console.error('Subscription renew error:', error);
    interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'Failed to create renewal link. Please try again.')],
    });
  }
}
