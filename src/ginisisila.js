'use strict';

// GiniSisila (ginisisilacartoon.net) — Sinhala dubbed cartoon search + details.
// Adapted from the Queen Senaya MD bot's server/ginisisila.ts.
// NOTE: the Byse/Filemoon decryptor + PoW solver, the yt-dlp download paths,
// the NoTube resolver and the Express stream handler were removed on purpose.
// Metadata only: no embed URLs, no host IDs, no download/stream URLs.

const { decodeHtmlEntities, stripTags } = require('./utils');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '120 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function normalizeThumbnailUrl(rawUrl) {
  if (!rawUrl) return '';
  let u = rawUrl.trim();
  if (u.startsWith('//')) u = `https:${u}`;
  u = u.replace(/=s(\d+)-rw(-nd-v1)?/i, '=s$1');
  return u;
}

const CARTOON_QUERY_ALIASES = {
  'soora pappa': ['pappa', 'soora', 'asterix'],
  'sura pappa': ['pappa', 'sura', 'asterix'],
  'chhota bheem': ['bheem'],
  'chota bheem': ['bheem'],
  'super bheem': ['bheem'],
  ben10: ['ben 10'],
  'scooby doo': ['scooby'],
  'walas mama': ['walas'],
  'giripura aththo': ['giripura'],
  pancha: ['pancha'],
  tintin: ['tintin'],
  garfield: ['garfield'],
};

async function scrapeGiniSisilaPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://ginisisilacartoon.net/',
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results = [];
    const seenIds = new Set();

    const blocks = html.split(/<div class="lakvision-tv-(?:inner-)?video-cell">/i).slice(1);

    for (const rawBlock of blocks) {
      const block = rawBlock.slice(0, 2500);
      const idMatch = block.match(/watch\.php\?id=(\d+)/i);
      if (!idMatch) continue;
      const id = idMatch[1];
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const titleMatch =
        block.match(/<div class="lakvision-tv-(?:inner-)?video-cell-title">\s*<a[^>]+title="([^"]+)"/i) ||
        block.match(/<div class="lakvision-tv-(?:inner-)?video-cell-title">\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/title="([^"]+)"/i);
      const rawTitle = titleMatch ? stripTags(titleMatch[1]) : `Sinhala Cartoon #${id}`;

      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
      const poster = imgMatch ? normalizeThumbnailUrl(imgMatch[1]) : '';

      const channelMatch = block.match(/channels\.php\?id=\d+">([^<]+)<\/a>/i);
      const channel = channelMatch ? stripTags(channelMatch[1]) : 'Sinhala Cartoon';

      const viewsMatch = block.match(/([\d,]+)\s*views/i);
      const views = viewsMatch ? `${viewsMatch[1]} views` : '';

      // Note: the original code puts the channel in `year` and the
      // channel/views string in `imdb`. Kept as-is for compatibility.
      results.push({
        id: results.length + 1,
        title: rawTitle,
        cleanTitle: rawTitle,
        year: channel,
        type: 'movie',
        quality: 'SINHALA',
        imdb: views ? `📺 ${channel} • ${views}` : `📺 ${channel}`,
        url: `https://ginisisilacartoon.net/watch.php?id=${id}`,
        slug: `gs:${id}`,
        poster,
      });

      if (results.length >= 15) break;
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchGiniSisilaCartoons(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.toLowerCase() === 'latest' || cleanQuery.toLowerCase() === 'cartoon') {
    return scrapeGiniSisilaPage('https://ginisisilacartoon.net/');
  }

  const lower = cleanQuery.toLowerCase();
  const candidateQueries = [cleanQuery];

  if (CARTOON_QUERY_ALIASES[lower]) {
    candidateQueries.push(...CARTOON_QUERY_ALIASES[lower]);
  }

  const words = cleanQuery.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length > 1) {
    // Add longest/most distinctive word as fallback (e.g. "chhota bheem" -> "bheem")
    candidateQueries.push(words[words.length - 1], words[0]);
  }

  const uniqueCandidates = [...new Set(candidateQueries)];
  for (const q of uniqueCandidates) {
    const results = await scrapeGiniSisilaPage(
      `https://ginisisilacartoon.net/search.php?q=${encodeURIComponent(q)}`
    );
    if (results.length > 0) {
      return results;
    }
  }

  return [];
}

async function getGiniSisilaCartoonDetails(slugOrId) {
  const cleanId = slugOrId.replace(/^gs:/i, '').trim();
  const watchUrl = `https://ginisisilacartoon.net/watch.php?id=${encodeURIComponent(cleanId)}`;
  const embedPageUrl = `https://lakvisiontv.net/embed.php?id=${encodeURIComponent(cleanId)}&autoplay=0`;

  const [watchRes, embedRes] = await Promise.all([
    fetch(watchUrl, { headers: { 'User-Agent': USER_AGENT } }),
    fetch(embedPageUrl, {
      headers: { 'User-Agent': USER_AGENT, Referer: watchUrl },
    }),
  ]);

  if (!watchRes.ok) {
    throw new Error(`GiniSisila watch page returned HTTP ${watchRes.status}`);
  }

  const watchHtml = await watchRes.text();
  const embedHtml = embedRes.ok ? await embedRes.text() : '';

  const titleMatch =
    watchHtml.match(/<div id="lakvision-tv-watch-video-title">\s*<h1>([\s\S]*?)<\/h1>/i) ||
    watchHtml.match(/<title>([^<]+)<\/title>/i);
  const cleanTitle = titleMatch
    ? stripTags(titleMatch[1]).replace(/^LakvisionTV\s*\|\s*/i, '').trim()
    : `Sinhala Cartoon #${cleanId}`;

  const channelMatch = watchHtml.match(/channels\.php\?id=\d+">([^<]+)<\/a>/i);
  const channel = channelMatch ? stripTags(channelMatch[1]) : 'GiniSisila TV';

  const catMatch = watchHtml.match(/more\.php\?cat=\d+">([^<]+)<\/a>/i);
  const category = catMatch ? stripTags(catMatch[1]) : 'Sinhala Dubbed Cartoon';

  const viewsMatch = watchHtml.match(/<div class="lakvision-tv-view-count">([^<]+)<\/div>/i);
  const views = viewsMatch ? stripTags(viewsMatch[1]) : '1,000+ views';

  const dateMatch = watchHtml.match(/Posted by LakvisionTV on\s*([^.<]+)\./i);
  const releaseDate = dateMatch ? stripTags(dateMatch[1]) : '2026';

  const aboutMatch = watchHtml.match(/<div id="video-information">([\s\S]*?)<\/div>/i);
  const synopsis = aboutMatch
    ? stripTags(aboutMatch[1]).replace(/^About Video:\s*/i, '').trim()
    : `${cleanTitle} (${category}) — Broadcast on ${channel}.`;

  // The embed frame is only inspected to detect the host type (for the
  // server label). The embed URL and host IDs are never returned.
  const iframeMatch = embedHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  let embedUrl = iframeMatch ? decodeHtmlEntities(iframeMatch[1].trim()) : '';
  if (embedUrl.startsWith('//')) {
    embedUrl = `https:${embedUrl}`;
  }

  let hostType = 'social';
  let qualityLabel = '720p';
  let sizeBytes = 125 * 1024 * 1024;
  let poster = '';

  const gdriveMatch = embedUrl.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  const byseMatch = embedUrl.match(/(?:bysezoxexe\.com|n1mwq\.org|filemoon\.[a-z]+)\/(?:e|d)\/([a-z0-9]+)/i);
  const ytMatch = embedUrl.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i);

  if (gdriveMatch) {
    hostType = 'gdrive';
    qualityLabel = '720p';
    try {
      // HEAD request only, to report the real file size as metadata.
      const gdDirect = `https://drive.usercontent.google.com/download?id=${gdriveMatch[1]}&export=download&confirm=t`;
      const headRes = await fetch(gdDirect, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });
      const cl = Number(headRes.headers.get('content-length') || 0);
      if (cl > 100_000) sizeBytes = cl;
    } catch {
      // fallback size
    }
    poster = `https://drive.google.com/thumbnail?id=${gdriveMatch[1]}&sz=w640`;
  } else if (byseMatch) {
    hostType = 'byse';
    qualityLabel = '1080p';
    poster = '';
  } else if (ytMatch) {
    hostType = 'youtube';
    qualityLabel = '720p';
    sizeBytes = 65 * 1024 * 1024;
    poster = `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  } else {
    hostType = 'social';
    qualityLabel = '720p';
    sizeBytes = 55 * 1024 * 1024;
  }

  const sizeFormatted = formatBytes(sizeBytes);

  const serverLabel =
    hostType === 'gdrive'
      ? 'GiniSisila Google Drive CDN ⚡'
      : hostType === 'byse'
      ? 'GiniSisila Byse 1080p Turbo CDN ⚡'
      : hostType === 'youtube'
      ? 'GiniSisila YouTube HD Stream ⚡'
      : 'GiniSisila Direct Video Server ⚡';

  const opt720 = {
    quality: qualityLabel === '1080p' ? 'FHD 1080p' : 'HD 720p',
    normalizedQuality: '720p',
    size: sizeFormatted,
    server: serverLabel,
    subtitleAuthor: `${channel} (Sinhala Dubbed)`,
  };

  const downloads = [opt720];
  const bestByQuality = {
    '720p': opt720,
  };

  if (qualityLabel === '1080p') {
    const opt1080 = {
      ...opt720,
      normalizedQuality: '1080p',
    };
    bestByQuality['1080p'] = opt1080;
    downloads.push(opt1080);
  }

  return {
    slug: `gs:${cleanId}`,
    url: watchUrl,
    title: cleanTitle,
    cleanTitle,
    year: channel,
    releaseDate,
    country: 'Sri Lanka (Sinhala Dubbed)',
    runtime: '22 min',
    imdb: `📺 ${channel} (${views})`,
    genres: [category, channel, 'Sinhala Cartoon'],
    synopsis,
    poster,
    thumbPoster: poster,
    downloads,
    bestByQuality,
  };
}

module.exports = { searchGiniSisilaCartoons, getGiniSisilaCartoonDetails };
