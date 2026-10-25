'use strict';

// SinhalaSub.lk — search + movie-details metadata.
// Adapted from the Queen Senaya MD bot's server/sinhalasub.ts.
// NOTE: download-link resolvers and the media streamer were removed on
// purpose. This module returns metadata only (no download URLs, no files).

const { decodeHtmlEntities, stripTags, normalizeQualityLabel, parseSizeMB } = require('./utils');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function upgradeTmdbPoster(url) {
  if (!url) return 'https://sinhalasub.lk/wp-content/uploads/2025/10/cropped-app-modified-1.png';
  return url.replace(/\/t\/p\/w(92|154|185|342)\//, '/t/p/w500/').trim();
}

function buildSearchQueryVariants(rawQuery) {
  const q = rawQuery.trim();
  const variants = new Set([q]);
  const lower = q.toLowerCase();

  const knownRewrites = {
    spiderman: 'Spider-Man',
    'spider man': 'Spider-Man',
    ironman: 'Iron Man',
    antman: 'Ant-Man',
    'ant man': 'Ant-Man',
    johnwick: 'John Wick',
    harrypotter: 'Harry Potter',
    fastandfurious: 'Fast & Furious',
    jurassicworld: 'Jurassic World',
    jurassicpark: 'Jurassic Park',
    missionimpossible: 'Mission: Impossible',
    doctorstrange: 'Doctor Strange',
    blackpanther: 'Black Panther',
    captainamerica: 'Captain America',
  };

  for (const [key, replacement] of Object.entries(knownRewrites)) {
    if (lower.includes(key)) {
      variants.add(lower.replace(key, replacement));
    }
  }

  if (lower.endsWith('man') && lower.length > 5 && !lower.includes('-') && !lower.includes(' ')) {
    const prefix = q.slice(0, -3);
    variants.add(`${prefix}-Man`);
    variants.add(`${prefix} Man`);
  }

  return Array.from(variants);
}

async function fetchSearchPageResults(cleanQuery) {
  const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(cleanQuery)}`;
  const res = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`SinhalaSub search failed with status ${res.status}`);
  }

  const html = await res.text();
  const results = [];
  const seenSlugs = new Set();

  const itemRegex =
    /<div id="item-(\d+)" class="display-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi;

  for (const match of html.matchAll(itemRegex)) {
    const id = match[1];
    const block = match[2];

    const linkMatch = block.match(
      /<a href="(https:\/\/sinhalasub\.lk\/movies\/([^/"]+)\/?)"[^>]*title="([^"]*)"/i
    );
    if (!linkMatch) continue;

    const url = linkMatch[1];
    const slug = linkMatch[2];
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const rawTitle = decodeHtmlEntities(linkMatch[3]);
    const cleanTitle = rawTitle
      .replace(/\s*\|\s*සිංහල උපසිරසි සමඟ.*$/i, '')
      .replace(/\s*Sinhala Subtitles.*$/i, '')
      .trim();

    const yearMatch = cleanTitle.match(/\((\d{4})\)/) || rawTitle.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : '';

    const imgMatch =
      block.match(/data-original="([^"]+)"/i) || block.match(/<img[^>]+src="([^"]+)"/i);
    const poster = upgradeTmdbPoster(imgMatch ? imgMatch[1] : '');

    const langMatch = block.match(/<span class="language">([^<]+)<\/span>/i);
    const qualMatch = block.match(/<span class="quality">([^<]+)<\/span>/i);

    results.push({
      id,
      slug,
      url,
      title: rawTitle,
      cleanTitle: cleanTitle || rawTitle,
      year,
      poster,
      quality: qualMatch ? stripTags(qualMatch[1]) : 'WEB-DL',
      language: langMatch ? stripTags(langMatch[1]) : 'Sinhala Sub',
    });

    if (results.length >= 10) break;
  }

  if (results.length === 0) {
    const fallbackRegex =
      /<a href="(https:\/\/sinhalasub\.lk\/movies\/([^/"]+)\/?)"[^>]*title="([^"]+)"/gi;
    for (const match of html.matchAll(fallbackRegex)) {
      const url = match[1];
      const slug = match[2];
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const rawTitle = decodeHtmlEntities(match[3]);
      const cleanTitle = rawTitle
        .replace(/\s*\|\s*සිංහල උපසිරසි සමඟ.*$/i, '')
        .replace(/\s*Sinhala Subtitles.*$/i, '')
        .trim();
      const yearMatch = cleanTitle.match(/\((\d{4})\)/);

      results.push({
        id: slug,
        slug,
        url,
        title: rawTitle,
        cleanTitle: cleanTitle || rawTitle,
        year: yearMatch ? yearMatch[1] : '',
        poster: 'https://sinhalasub.lk/wp-content/uploads/2025/10/cropped-app-modified-1.png',
        quality: 'HD',
        language: 'Sinhala Sub',
      });
      if (results.length >= 10) break;
    }
  }

  return results;
}

async function searchSinhalaSubMovies(query) {
  const variants = buildSearchQueryVariants(query);
  for (const variant of variants) {
    const results = await fetchSearchPageResults(variant);
    if (results.length > 0) {
      return results;
    }
  }
  return [];
}

// Fastest servers first: Pixeldrain (#1) and DLServer-02 (#2) are fastest.
function serverPriority(server) {
  const s = String(server || '').toLowerCase();
  if (s.includes('pixeldrain')) return 1;
  if (s.includes('dlserver-02')) return 2;
  if (s.includes('dlserver-01')) return 3;
  if (s.includes('filespayout')) return 4;
  return 5;
}

async function getSinhalaSubMovieDetails(slugOrUrl) {
  const cleanInput = slugOrUrl.trim();
  const slug = cleanInput
    .replace(/^https?:\/\/sinhalasub\.lk\/movies\//i, '')
    .replace(/\/+$/, '');
  const movieUrl = `https://sinhalasub.lk/movies/${slug}/`;

  const res = await fetch(movieUrl, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch movie page (${res.status})`);
  }

  const html = await res.text();

  const titleMatch =
    html.match(/<div class="details-title">\s*<h3>([\s\S]*?)<\/h3>/i) ||
    html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = decodeHtmlEntities(
    (titleMatch ? stripTags(titleMatch[1]) : slug).replace(/\s*[–-]\s*SinhalaSub\.LK$/i, '')
  );
  const cleanTitle = rawTitle
    .replace(/\s*\|\s*සිංහල උපසිරසි සමඟ.*$/i, '')
    .replace(/\s*Sinhala Subtitles.*$/i, '')
    .trim();

  const yearMatch =
    html.match(/<strong>Year:<\/strong>\s*<a[^>]*>(\d{4})<\/a>/i) ||
    cleanTitle.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : '';

  const dateMatch = html.match(/itemprop="dateCreated"\s+content="([^"]+)"/i);
  const releaseDate = dateMatch ? stripTags(dateMatch[1]) : year;

  const posterMatch =
    html.match(/<img[^>]+class="poster-img"[^>]+src="([^"]+)"/i) ||
    html.match(/property=['"]og:image['"]\s+content=['"]([^'"]+)['"]/i) ||
    html.match(/https:\/\/image\.tmdb\.org\/t\/p\/[^\s"'<>]+/i);

  const rawPoster = posterMatch ? (posterMatch[1] || posterMatch[0]).trim() : '';
  const poster = upgradeTmdbPoster(rawPoster);
  const thumbPoster = rawPoster || poster;

  const qualityMatch = html.match(/<span class="data-quality">([^<]+)<\/span>/i);
  const languageMatch = html.match(/<span class="data-language">([^<]+)<\/span>/i);
  const imdbMatch = html.match(/<span class="data-imdb[^"]*">\s*IMDb:\s*([0-9.]+)/i);
  const durationMatch = html.match(/<span itemprop=['"]duration['"][^>]*>([^<]+)<\/span>/i);

  const genreSection = html.match(/<div class="details-genre">([\s\S]*?)<\/div>/i);
  const genres = [];
  if (genreSection) {
    for (const g of genreSection[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)) {
      genres.push(stripTags(g[1]));
    }
  }

  const subAuthorMatch = html.match(
    /<strong>Subtitle Author:<\/strong>\s*<a[^>]*>([\s\S]*?)<\/a>/i
  );
  const subSiteMatch = html.match(
    /<strong>Subtitle Site:<\/strong>\s*<a[^>]*>([\s\S]*?)<\/a>/i
  );

  const descSection = html.match(/<div class="details-desc">([\s\S]*?)<\/div>/i);
  const tagSection = html.match(/<div class="details-tag">([\s\S]*?)<\/div>/i);
  const rawDesc = descSection ? stripTags(descSection[1]) : '';
  const rawTag = tagSection ? stripTags(tagSection[1]) : '';
  const description = rawDesc || rawTag || 'Sinhala subtitled movie from SinhalaSub.lk';

  // Download options are metadata only: server / quality / size.
  // The original link codes and link-page URLs are NOT included.
  const downloads = [];
  const rowRegex =
    /<tr id=['"]link-row-(\d+)['"]>[\s\S]*?<a href=['"](https:\/\/sinhalasub\.lk\/links\/([^/'"]+)\/?)['"][^>]*>([^<]+)<\/a>[\s\S]*?<span class=['"]quality['"]>([^<]+)<\/span><\/td><td><span>([^<]+)<\/span>/gi;

  for (const match of html.matchAll(rowRegex)) {
    const id = match[1];
    const server = stripTags(match[4]);
    const quality = stripTags(match[5]);
    const size = stripTags(match[6]);
    const normalizedQuality = normalizeQualityLabel(quality);

    downloads.push({
      id,
      server,
      quality,
      normalizedQuality,
      size,
    });
  }

  // Sort so Pixeldrain & DLServer-02 always come first, smallest file within same tier.
  downloads.sort((a, b) => {
    const pDiff = serverPriority(a.server) - serverPriority(b.server);
    if (pDiff !== 0) return pDiff;
    return parseSizeMB(a.size) - parseSizeMB(b.size);
  });

  const bestByQuality = {};
  for (const q of ['480p', '720p', '1080p']) {
    const candidates = downloads.filter((d) => d.normalizedQuality === q);
    if (candidates.length > 0) {
      bestByQuality[q] = candidates[0];
    }
  }

  return {
    slug,
    url: movieUrl,
    title: rawTitle,
    cleanTitle: cleanTitle || rawTitle,
    year,
    releaseDate,
    poster,
    thumbPoster,
    quality: qualityMatch ? stripTags(qualityMatch[1]) : 'WEB-DL',
    language: languageMatch ? stripTags(languageMatch[1]) : 'English',
    imdb: imdbMatch ? stripTags(imdbMatch[1]) : 'N/A',
    duration: durationMatch ? stripTags(durationMatch[1]) : 'N/A',
    genres,
    subtitleAuthor: subAuthorMatch ? stripTags(subAuthorMatch[1]) : 'SinhalaSub',
    subtitleSite: subSiteMatch ? stripTags(subSiteMatch[1]) : 'SinhalaSub.lk',
    description,
    downloads,
    bestByQuality,
  };
}

module.exports = { searchSinhalaSubMovies, getSinhalaSubMovieDetails };
