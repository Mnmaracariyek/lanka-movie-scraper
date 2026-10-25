'use strict';

// YTS — search + movie-details metadata via the public YTS API mirrors.
// Adapted from the Queen Senaya MD bot's server/yts.ts.
// NOTE: the torrent engine, torrent-file fetcher, Dailymotion/yt-dlp mirror
// and the Express stream handler were removed on purpose. Metadata only:
// torrent hashes and torrent-download URLs are NOT included.

const { normalizeQualityLabel } = require('./utils');

const YTS_API_BASES = [
  'https://movies-api.accel.li/api/v2',
  'https://yts.lt/api/v2',
  'https://yts.bz/api/v2',
  'https://yts.am/api/v2',
  'https://yts.ag/api/v2',
];

async function fetchYtsApiJson(endpointAndQuery) {
  let lastErr;
  for (const base of YTS_API_BASES) {
    const url = `${base}/${endpointAndQuery}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.status === 'ok' && json.data) {
        return json.data;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All YTS API mirrors failed');
}

async function searchYtsMovies(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  try {
    const data = await fetchYtsApiJson(
      `list_movies.json?query_term=${encodeURIComponent(cleanQuery)}&limit=10&sort_by=download_count`
    );
    const movies = Array.isArray(data?.movies) ? data.movies : [];
    return movies.map((m) => {
      const torrents = Array.isArray(m.torrents) ? m.torrents : [];
      const qualities = [...new Set(torrents.map((t) => t.quality).filter(Boolean))];
      const bestQualityLabel = qualities.includes('1080p')
        ? '1080p / 720p'
        : qualities[0] || 'HD';

      return {
        id: String(m.id),
        slug: `yts:${m.id}`,
        url: m.url || `https://yts.lt/movies/${m.slug || m.id}`,
        title: m.title_long || `${m.title} (${m.year})`,
        cleanTitle: m.title || m.title_english || 'Movie',
        year: m.year ? String(m.year) : '',
        poster: m.large_cover_image || m.medium_cover_image || '',
        quality: bestQualityLabel,
        language: `YTS ${m.language ? m.language.toUpperCase() : 'EN'} • ⭐ ${m.rating || 'N/A'}`,
      };
    });
  } catch (err) {
    console.warn('YTS search error:', err?.message || err);
    return [];
  }
}

async function getYtsMovieDetails(slug) {
  const movieId = slug.replace(/^yts:/i, '').trim();
  const data = await fetchYtsApiJson(`movie_details.json?movie_id=${encodeURIComponent(movieId)}&with_images=true`);
  const m = data?.movie;
  if (!m || !m.id) {
    throw new Error(`YTS movie not found for ID: ${movieId}`);
  }

  const rawTorrents = Array.isArray(m.torrents) ? m.torrents : [];
  // Sort so x264 web/bluray with higher seeds come first (best compatibility & speed)
  const sortedTorrents = [...rawTorrents].sort((a, b) => {
    const codecScoreA = (a.video_codec || '').toLowerCase() === 'x265' ? 1 : 0;
    const codecScoreB = (b.video_codec || '').toLowerCase() === 'x265' ? 1 : 0;
    if (codecScoreA !== codecScoreB) return codecScoreA - codecScoreB;
    return (Number(b.seeds) || 0) - (Number(a.seeds) || 0);
  });

  // Release options are metadata only: quality / codec / seeds / peers / size.
  // Torrent hashes and torrent-download URLs are NOT included.
  const downloads = [];
  const bestByQuality = {};

  for (let i = 0; i < sortedTorrents.length; i++) {
    const t = sortedTorrents[i];
    const qualityRaw = String(t.quality || '720p');
    const typeLabel = String(t.type || 'web').toUpperCase();
    const codecLabel = String(t.video_codec || 'x264').toUpperCase();
    const normQ = normalizeQualityLabel(qualityRaw);

    const opt = {
      id: `${m.id}_${i + 1}`,
      server: `YTS Direct MP4 (${typeLabel} ${codecLabel} • 🌱 ${t.seeds || 0})`,
      quality: qualityRaw,
      normalizedQuality: normQ,
      size: t.size || '1.0 GB',
      seeds: Number(t.seeds) || 0,
      peers: Number(t.peers) || 0,
    };

    downloads.push(opt);
    if ((normQ === '480p' || normQ === '720p' || normQ === '1080p') && !bestByQuality[normQ]) {
      bestByQuality[normQ] = opt;
    }
  }

  return {
    slug: `yts:${m.id}`,
    url: m.url || `https://yts.lt/movies/${m.slug || m.id}`,
    title: m.title_long || `${m.title} (${m.year})`,
    cleanTitle: m.title || m.title_english || 'Movie',
    year: m.year ? String(m.year) : '',
    releaseDate: m.year ? String(m.year) : 'N/A',
    poster: m.large_cover_image || m.medium_cover_image || '',
    thumbPoster: m.medium_cover_image || m.small_cover_image || '',
    quality: bestByQuality['1080p'] ? '1080p FHD' : '720p HD',
    language: m.language ? m.language.toUpperCase() : 'EN',
    imdb: m.rating ? `${m.rating}/10 (IMDb ${m.imdb_code || ''})`.trim() : 'N/A',
    duration: m.runtime ? `${m.runtime} min` : 'N/A',
    genres: Array.isArray(m.genres) ? m.genres : ['Movie'],
    subtitleAuthor: 'YTS Official',
    subtitleSite: 'YTS.LT / YTS.MX',
    description: m.description_full || m.summary || m.synopsis || '',
    downloads,
    bestByQuality,
  };
}

module.exports = { searchYtsMovies, getYtsMovieDetails };
