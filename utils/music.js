const { Collection } = require('discord.js');
const play = require('play-dl');
const ytdlp = require('youtube-dl-exec');
const { spawn } = require('child_process');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');

// Store music queues per guild
const musicQueues = new Collection();

// Create music queue for guild
function createQueue(guildId) {
  if (!musicQueues.has(guildId)) {
    musicQueues.set(guildId, {
      songs: [],
      playing: false,
      volume: 0.5,
      player: null,
      currentProcess: null,
      voiceChannelId: null,
      textChannelId: null,
    });
  }
  return musicQueues.get(guildId);
}

// Get music queue for guild
function getQueue(guildId) {
  return musicQueues.get(guildId) || null;
}

// Add song to queue
function addSongToQueue(guildId, song) {
  const queue = createQueue(guildId);
  queue.songs.push(song);
  return queue.songs.length;
}

function normalizeSong(song) {
  if (!song || typeof song !== 'object') return null;
  const normalized = { ...song };

  if ((!normalized.url || typeof normalized.url !== 'string') && normalized.id) {
    normalized.url = `https://www.youtube.com/watch?v=${normalized.id}`;
  }

  if (!normalized.url || typeof normalized.url !== 'string') {
    return null;
  }

  normalized.url = normalized.url.trim().replace(/^<|>$/g, '');

  try {
    new URL(normalized.url);
  } catch (err) {
    return null;
  }

  if (!normalized.title) {
    normalized.title = 'Unknown title';
  }

  return normalized;
}

function killCurrentProcess(queue) {
  if (queue && queue.currentProcess) {
    try {
      queue.currentProcess.kill('SIGKILL');
    } catch (e) {
      // no-op
    }
    queue.currentProcess = null;
  }
}

async function createTrackResource(song, queue) {
  // Pipe yt-dlp directly into ffmpeg so signed media URLs stay
  // inside yt-dlp and retain the request context YouTube requires.
  const ytProcess = ytdlp.exec(song.url, {
    format: '18/bestaudio/best',
    noPlaylist: true,
    noWarnings: true,
    noCheckCertificates: true,
    extractorArgs: 'youtube:player_client=android',
    output: '-',
  });

  const ffmpegArgs = [
    '-i', 'pipe:0',
    '-analyzeduration', '0',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  queue.currentProcess = {
    kill(signal) {
      try {
        ytProcess.kill(signal);
      } catch (e) {
        // no-op
      }
      try {
        ffmpeg.kill(signal);
      } catch (e) {
        // no-op
      }
    },
  };

  ytProcess.stdout.pipe(ffmpeg.stdin);

  ffmpeg.stdin.on('error', (err) => {
    if (err.code !== 'EPIPE') {
      console.error('ffmpeg input error:', err);
    }
  });

  ytProcess.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.error('yt-dlp:', msg);
  });

  ytProcess.on('error', (err) => {
    console.error('yt-dlp process error:', err);
  });

  ytProcess.catch((err) => {
    console.error('yt-dlp stream error:', err?.message || err);
    if (!ffmpeg.killed) {
      ffmpeg.kill('SIGKILL');
    }
  });

  ffmpeg.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.error('ffmpeg:', msg);
  });

  ffmpeg.on('error', (err) => {
    console.error('ffmpeg process error:', err);
  });

  return createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });
}

// Get current song
function getCurrentSong(guildId) {
  const queue = getQueue(guildId);
  return queue && queue.songs.length > 0 ? queue.songs[0] : null;
}

// Skip song
function skipSong(guildId) {
  const queue = getQueue(guildId);
  if (queue && queue.songs.length > 0) {
    return queue.songs.shift();
  }
  return null;
}

// Skip currently playing song and advance playback.
function skipCurrentSong(guild, guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.songs.length === 0) return null;

  const currentSong = queue.songs[0];

  // Normal path: stopping the player triggers the Idle handler in playNext,
  // which shifts the current song and starts the next one immediately.
  if (queue.player && queue.playing) {
    try {
      queue.player.stop(true);
    } catch (error) {
      console.error('skipCurrentSong stop error:', error);
      queue.songs.shift();
      playNext(guild, guildId).catch((e) => console.error('skipCurrentSong fallback playNext error:', e));
    }
    return currentSong;
  }

  // Fallback for stale state where a song exists but no active player.
  queue.songs.shift();
  playNext(guild, guildId).catch((e) => console.error('skipCurrentSong playNext error:', e));
  return currentSong;
}

// Clear queue
function clearQueue(guildId) {
  const queue = getQueue(guildId);
  if (queue) {
    queue.songs = [];
    queue.playing = false;
    killCurrentProcess(queue);

    if (queue.player) {
      try {
        queue.player.stop(true);
      } catch (e) {
        // no-op
      }
      queue.player = null;
    }

    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
  }
}

// Delete queue
function deleteQueue(guildId) {
  clearQueue(guildId);
  musicQueues.delete(guildId);
}

// Play next song in queue
async function playNext(guild, guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.songs.length === 0) {
    if (queue) {
      queue.playing = false;
      killCurrentProcess(queue);
      if (queue.player) {
        try {
          queue.player.stop();
        } catch (e) {
          // no-op
        }
        queue.player = null;
      }
    }

    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    return;
  }

  const song = normalizeSong(queue.songs[0]);
  if (!song) {
    queue.songs.shift();
    return playNext(guild, guildId);
  }

  try {
    let conn = getVoiceConnection(guildId);
    if (!conn) {
      conn = joinVoiceChannel({
        channelId: queue.voiceChannelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
      });
      await entersState(conn, VoiceConnectionStatus.Ready, 15000);
    }

    if (!queue.player) {
      queue.player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
      });
      conn.subscribe(queue.player);

      queue.player.on('error', (err) => {
        console.error('Audio player error:', err);
        killCurrentProcess(queue);
      });
    }

    const resource = await createTrackResource(song, queue);
    resource.volume.setVolume(queue.volume || 0.5);

    queue.player.play(resource);
    queue.playing = true;

    queue.player.once(AudioPlayerStatus.Idle, () => {
      killCurrentProcess(queue);
      queue.songs.shift();
      playNext(guild, guildId).catch((e) => console.error('playNext error:', e));
    });
  } catch (error) {
    console.error('playNext error:', error);
    killCurrentProcess(queue);
    queue.songs.shift();
    playNext(guild, guildId).catch((e) => console.error('playNext error2:', e));
  }
}

// Search YouTube
async function searchYoutube(query) {
  try {
    const results = await play.search(query, { limit: 1 });
    if (results.length > 0) {
      const video = results[0];
      const url = video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : null);
      if (!url) {
        return null;
      }

      return {
        title: video.title || query,
        url,
        id: video.id || null,
        duration: video.durationInSec || 0,
        thumbnail: video.thumbnails?.[0]?.url || null,
      };
    }
  } catch (error) {
    console.error('YouTube search error:', error);
  }
  return null;
}

// Get video info
async function getVideoInfo(url) {
  try {
    const info = await play.video_info(url);
    return {
      title: info.video_details.title,
      url,
      duration: info.video_details.durationInSec,
      thumbnail: info.video_details.thumbnails?.[0]?.url || null,
    };
  } catch (error) {
    console.error('Video info error:', error);
  }
  return null;
}

// Extract Spotify track name (basic extraction)
function extractSpotifyTrack(url) {
  const match = url.match(/spotify\.com\/track\/([^?]+)/);
  if (match) {
    return {
      trackId: match[1],
    };
  }
  return null;
}

// Validate YouTube URL
function isYoutubeUrl(url) {
  return /youtube\.com|youtu\.be/.test(url);
}

// Validate Spotify URL
function isSpotifyUrl(url) {
  return /spotify\.com/.test(url);
}

module.exports = {
  createQueue,
  getQueue,
  addSongToQueue,
  normalizeSong,
  getCurrentSong,
  skipSong,
  skipCurrentSong,
  clearQueue,
  deleteQueue,
  playNext,
  searchYoutube,
  getVideoInfo,
  extractSpotifyTrack,
  isYoutubeUrl,
  isSpotifyUrl,
  musicQueues,
};
