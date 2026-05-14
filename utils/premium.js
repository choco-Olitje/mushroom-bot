const { readData, writeData } = require('./database');
const Stripe = require('stripe');
const config = require('../config');

const stripe = new Stripe(config.stripe.secretKey);

function addCalendarMonths(baseDate, months) {
  const result = new Date(baseDate.getTime());
  const dayOfMonth = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0
  )).getUTCDate();

  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return result;
}

function getLaterExpiry(existingExpiresAt, nextExpiresAt) {
  if (!existingExpiresAt) return nextExpiresAt;
  if (!nextExpiresAt) return existingExpiresAt;

  const existingDate = new Date(existingExpiresAt);
  const nextDate = new Date(nextExpiresAt);

  if (Number.isNaN(existingDate.getTime())) return nextExpiresAt;
  if (Number.isNaN(nextDate.getTime())) return existingExpiresAt;

  return existingDate > nextDate ? existingExpiresAt : nextExpiresAt;
}

// Get premium status for server
function getPremiumStatus(serverId) {
  const premiumData = readData('premium', {});
  const serverPremium = premiumData[serverId];
  
  if (!serverPremium) {
    return { premium: false, expiresAt: null, stripeSubId: null };
  }
  
  const expiresAt = serverPremium.expiresAt ? new Date(serverPremium.expiresAt) : null;

  // Check if subscription has expired
  if (expiresAt && expiresAt < new Date()) {
    return { premium: false, expiresAt: serverPremium.expiresAt, stripeSubId: serverPremium.stripeSubId };
  }
  
  return {
    premium: serverPremium.premium !== false || Boolean(expiresAt && expiresAt >= new Date()),
    expiresAt: serverPremium.expiresAt,
    stripeSubId: serverPremium.stripeSubId,
    stripeCustomerId: serverPremium.stripeCustomerId,
  };
}

// Set premium status for server
function setPremiumStatus(serverId, data) {
  const premiumData = readData('premium', {});
  const currentPremium = premiumData[serverId] || {};
  const nextExpiresAt = data.expiresAt || currentPremium.expiresAt;

  premiumData[serverId] = {
    ...currentPremium,
    ...data,
    expiresAt: getLaterExpiry(currentPremium.expiresAt, nextExpiresAt),
  };
  writeData('premium', premiumData);
}

function grantPremiumMonths(serverId, months, metadata = {}) {
  const currentStatus = getPremiumStatus(serverId);
  const now = new Date();
  const currentExpiry = currentStatus.premium && currentStatus.expiresAt ? new Date(currentStatus.expiresAt) : null;
  const baseDate = currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now ? currentExpiry : now;
  const expiresAt = addCalendarMonths(baseDate, months).toISOString();

  setPremiumStatus(serverId, {
    premium: true,
    expiresAt,
    ...metadata,
  });

  return getPremiumStatus(serverId);
}

// Check if premium is active
function isPremium(serverId) {
  return getPremiumStatus(serverId).premium === true;
}

// Create Stripe checkout session
async function createCheckoutSession(serverId, userId, guildName) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      client_reference_id: serverId,
      line_items: [
        {
          price: config.stripe.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          serverId,
          userId,
          guildName,
        },
      },
      success_url: `https://discord.com/channels/${serverId}`,
      cancel_url: `https://discord.com/channels/${serverId}`,
      metadata: {
        serverId,
        userId,
        guildName,
      },
    });
    
    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

// Get user subscriptions
function getUserSubscriptions(userId) {
  const subscriptions = readData('userSubscriptions', {});
  return subscriptions[userId] || [];
}

// Add user subscription
function addUserSubscription(userId, serverId, stripeCustomerId, stripeSubId) {
  const subscriptions = readData('userSubscriptions', {});
  if (!subscriptions[userId]) subscriptions[userId] = [];
  
  subscriptions[userId].push({
    serverId,
    stripeCustomerId,
    stripeSubId,
    createdAt: new Date().toISOString(),
  });
  
  writeData('userSubscriptions', subscriptions);
}

// Cancel user subscription
async function cancelUserSubscription(userId, serverId) {
  try {
    const premiumData = readData('premium', {});
    const serverPremium = premiumData[serverId];
    
    if (serverPremium && serverPremium.stripeSubId) {
      await stripe.subscriptions.update(serverPremium.stripeSubId, {
        cancel_at_period_end: true,
      });
      
      // Keep premium active until billing period ends
      premiumData[serverId] = {
        ...premiumData[serverId],
        canceledAt: new Date().toISOString(),
      };
      writeData('premium', premiumData);
      
      return true;
    }
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

// Handle Stripe webhook
function handleStripeWebhook(event) {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        if (session.metadata || session.client_reference_id) {
          const serverId = session.metadata?.serverId || session.client_reference_id;
          const userId = session.metadata?.userId || 'unknown';
          const guildName = session.metadata?.guildName || 'unknown';
          
          setPremiumStatus(serverId, {
            premium: true,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            stripeCustomerId: session.customer,
            stripeSubId: session.subscription,
            userId,
          });
          
          if (userId !== 'unknown') {
            addUserSubscription(userId, serverId, session.customer, session.subscription);
          }
        }
        break;

      case 'invoice.paid':
        const invoice = event.data.object;
        if (invoice.subscription) {
          const premiumDataInvoice = readData('premium', {});

          for (const [serverId, data] of Object.entries(premiumDataInvoice)) {
            if (data.stripeSubId === invoice.subscription) {
              premiumDataInvoice[serverId] = {
                ...premiumDataInvoice[serverId],
                premium: true,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              };
              writeData('premium', premiumDataInvoice);
              break;
            }
          }
        }
        break;
        
      case 'customer.subscription.updated':
        const subscription = event.data.object;
        const premiumData = readData('premium', {});
        
        // Find server with this subscription
        for (const [serverId, data] of Object.entries(premiumData)) {
          if (data.stripeSubId === subscription.id) {
            if (subscription.status === 'active') {
              const renewalDate = new Date(subscription.current_period_end * 1000);
              premiumData[serverId].expiresAt = renewalDate.toISOString();
            }
            break;
          }
        }
        writeData('premium', premiumData);
        break;

      case 'customer.subscription.created':
        const createdSubscription = event.data.object;
        if (createdSubscription.metadata?.serverId) {
          setPremiumStatus(createdSubscription.metadata.serverId, {
            premium: true,
            expiresAt: new Date(createdSubscription.current_period_end * 1000).toISOString(),
            stripeCustomerId: createdSubscription.customer,
            stripeSubId: createdSubscription.id,
            userId: createdSubscription.metadata.userId,
          });
        }
        break;
        
      case 'customer.subscription.deleted':
        const deletedSub = event.data.object;
        const premiumDataDel = readData('premium', {});
        
        for (const [serverId, data] of Object.entries(premiumDataDel)) {
          if (data.stripeSubId === deletedSub.id) {
            premiumDataDel[serverId].premium = false;
            break;
          }
        }
        writeData('premium', premiumDataDel);
        break;
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
  }
}

module.exports = {
  getPremiumStatus,
  setPremiumStatus,
  grantPremiumMonths,
  isPremium,
  createCheckoutSession,
  getUserSubscriptions,
  addUserSubscription,
  cancelUserSubscription,
  handleStripeWebhook,
};
