const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getTempVCSetup, addTempVC, removeTempVC, getTempVCs } = require('../utils/serverData');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    // Handle joining temp VC creation channel
    if (!oldState.channel && newState.channel) {
      try {
        const setupChannel = getTempVCSetup(newState.guild.id);
        
        if (newState.channel.id === setupChannel) {
          // Create temporary voice channel
          const tempVC = await newState.guild.channels.create({
            name: `${newState.member.user.username}'s VC`,
            type: ChannelType.GuildVoice,
            parent: newState.channel.parent,
            permissionOverwrites: [
              {
                id: newState.guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
              },
              {
                id: newState.member.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.MoveMembers,
                  PermissionFlagsBits.ManageChannels,
                ],
              },
            ],
          });
          
          // Move user to new channel
          await newState.member.voice.setChannel(tempVC);
          
          // Store temp VC data
          addTempVC(newState.guild.id, tempVC.id, newState.member.id);

          // Send embed in the built-in VC chat (Open Chat) with DM fallback
          const embed = new EmbedBuilder()
            .setColor(0x00AFF4)
            .setTitle('🎤 Temporary Voice Channel Created')
            .setDescription(`Your voice channel **${tempVC.name}** has been created!\n\nYou are the owner and can use these commands:`)
            .addFields(
              { name: '/temp-vc set-owner', value: 'Transfer ownership to another user' },
              { name: '/temp-vc set-limit', value: 'Set maximum users (0 = unlimited)' },
              { name: '/temp-vc blacklist', value: 'Block specific users' },
              { name: '/temp-vc whitelist', value: 'Allow specific users' },
              { name: '/temp-vc private', value: 'Lock/unlock the channel' },
              { name: '/temp-vc rename', value: 'Rename the channel' }
            )
            .setFooter({ text: 'Channel auto-deletes when empty' })
            .setTimestamp();

          try {
            if (tempVC.isTextBased() && tempVC.viewable) {
              await tempVC.send({ content: `<@${newState.member.id}>`, embeds: [embed] });
            } else {
              await newState.member.send({ embeds: [embed] });
            }
          } catch (sendErr) {
            try {
              await newState.member.send({ embeds: [embed] });
            } catch (dmErr) {
              console.log('Could not send temp VC embed to VC chat or DM:', dmErr.message);
            }
          }
        }
      } catch (error) {
        console.error('Temp VC creation error:', error);
      }
    }
    
    // Handle leaving temp VC (auto-delete if empty)
    if (oldState.channel && !newState.channel) {
      try {
        const tempVCs = getTempVCs(oldState.guild.id);
        const tempVC = tempVCs[oldState.channel.id];
        
        if (tempVC && oldState.channel.members.size === 0) {
          // Wait 2 seconds before deleting
          setTimeout(async () => {
            try {
              const channelStill = await oldState.guild.channels.fetch(oldState.channel.id);
              if (channelStill && channelStill.members.size === 0) {
                await channelStill.delete('Auto-delete empty temp VC');
                removeTempVC(oldState.guild.id, oldState.channel.id);
              }
            } catch (err) {
              console.error('Temp VC deletion error:', err);
            }
          }, 2000);
        }
      } catch (error) {
        console.error('Temp VC check error:', error);
      }
    }
  },
};
