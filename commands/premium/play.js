const { SlashCommandBuilder, ChannelType, VoiceBasedChannel } = require('discord.js');
const { isPremium } = require('../../utils/premium');
const { createPremiumRequiredEmbed, createErrorEmbed, createSuccessEmbed } = require('../../utils/embeds');
const { addSongToQueue, searchYoutube, getVideoInfo, normalizeSong, isYoutubeUrl, isSpotifyUrl, extractSpotifyTrack } = require('../../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('[PREMIUM] Play music in voice channel')
    .addSubcommand(subcommand =>
      subcommand
        .setName('song')
        .setDescription('Play a song by name or URL')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Song name, YouTube URL, or Spotify link')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('skip')
        .setDescription('Skip the current song')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop music and clear queue')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('queue')
        .setDescription('View the music queue')
    ),
  
  async execute(interaction) {
    // Check premium
    if (!isPremium(interaction.guildId)) {
      return interaction.reply({
        embeds: [createPremiumRequiredEmbed()],
        ephemeral: true,
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'song') {
      return handlePlaySong(interaction);
    } else if (subcommand === 'skip') {
      return handleSkip(interaction);
    } else if (subcommand === 'stop') {
      return handleStop(interaction);
    } else if (subcommand === 'queue') {
      return handleQueue(interaction);
    }
  },
};

async function handlePlaySong(interaction) {
  try {
    await interaction.deferReply();
    
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'You must be in a voice channel to play music.')],
      });
    }
    
    const voiceChannel = interaction.member.voice.channel;
    
    const query = interaction.options.getString('query');
    let songInfo = null;
    
    // Handle different input types
    if (isYoutubeUrl(query)) {
      // Resolve metadata and ensure we queue a playable URL.
      songInfo = await getVideoInfo(query);
      if (!songInfo) {
        songInfo = { title: 'YouTube Track', url: query };
      }
    } else if (isSpotifyUrl(query)) {
      // Extract Spotify track and search on YouTube
      const spotifyTrack = extractSpotifyTrack(query);
      if (spotifyTrack) {
        const results = await searchYoutube(`spotify track ${spotifyTrack.trackId}`);
        songInfo = results;
      }
    } else {
      // Search YouTube
      songInfo = await searchYoutube(query);
    }

    songInfo = normalizeSong(songInfo);
    if (!songInfo) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Not Found', 'Could not resolve a playable URL for that song.')],
      });
    }
    
    // Add to queue
    const queuePosition = addSongToQueue(interaction.guildId, songInfo);

    // Ensure bot can connect
    if (!voiceChannel.permissionsFor(interaction.client.user).has('Connect')) {
      return interaction.editReply({
        embeds: [createErrorEmbed('❌ Error', 'I do not have permission to connect to your voice channel.')],
      });
    }

    // Set queue voice/text channel info and start playback if idle
    const { getQueue, playNext } = require('../../utils/music');
    const queue = getQueue(interaction.guildId);
    if (queue) {
      queue.voiceChannelId = voiceChannel.id;
      queue.textChannelId = interaction.channel.id;
    }

    // If nothing is currently playing, start playback
    try {
      if (!queue.playing) {
        playNext(interaction.guild, interaction.guildId).catch(err => console.error('playNext start error:', err));
      }
    } catch (err) {
      console.error('Error starting playback:', err);
    }

    interaction.editReply({
      embeds: [createSuccessEmbed(
        '🎵 Added to Queue',
        `**${songInfo.title}**\n\nPosition in queue: #${queuePosition}`
      )],
    });
  } catch (error) {
    console.error('Play song error:', error);
    interaction.editReply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred while playing the song.')],
    });
  }
}

async function handleSkip(interaction) {
  try {
    const { getQueue, skipCurrentSong } = require('../../utils/music');
    
    const queue = getQueue(interaction.guildId);
    if (!queue || queue.songs.length === 0) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'There is no music playing.')],
        ephemeral: true,
      });
    }
    
    const skipped = skipCurrentSong(interaction.guild, interaction.guildId);

    if (!skipped) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Error', 'There is no music playing.')],
        ephemeral: true,
      });
    }
    
    interaction.reply({
      embeds: [createSuccessEmbed('⏭️ Skipped', `Skipped **${skipped.title}**`)],
    });
  } catch (error) {
    console.error('Skip error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred while skipping.')],
      ephemeral: true,
    });
  }
}

async function handleStop(interaction) {
  try {
    const { clearQueue } = require('../../utils/music');
    
    clearQueue(interaction.guildId);
    
    interaction.reply({
      embeds: [createSuccessEmbed('⏹️ Stopped', 'Music stopped and queue cleared.')],
    });
  } catch (error) {
    console.error('Stop error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred while stopping.')],
      ephemeral: true,
    });
  }
}

async function handleQueue(interaction) {
  try {
    const { getQueue } = require('../../utils/music');
    const { createQueueEmbed } = require('../../utils/embeds');
    
    const queue = getQueue(interaction.guildId);
    
    if (!queue || queue.songs.length === 0) {
      return interaction.reply({
        embeds: [createErrorEmbed('❌ Empty Queue', 'The queue is currently empty.')],
        ephemeral: true,
      });
    }
    
    interaction.reply({
      embeds: [createQueueEmbed(queue.songs)],
    });
  } catch (error) {
    console.error('Queue error:', error);
    interaction.reply({
      embeds: [createErrorEmbed('❌ Error', 'An error occurred while fetching the queue.')],
      ephemeral: true,
    });
  }
}
