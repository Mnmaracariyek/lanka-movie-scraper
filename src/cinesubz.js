'use strict';

// CineSubz — search + movie-details metadata.
// Adapted from the Queen Senaya MD bot's server/cinesubz.ts.
// NOTE: the fast-mirror resolver (VM sandbox + AES decryptor that produced
// direct video URLs) was removed on purpose. Metadata only.

const { decodeHtmlEntities, stripTags, normalizeQualityLabel, parseSizeMB } = require('./utils');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function cleanMovieTitle(rawTitle) {
  return rawTitle
    .replace(/\s*\|\s*සිංහල උපසිරැ?සි සමඟ.*$/i, '')
    .replace(/\s*Sinhala Subtitles.*$/i, '')
    .replace(/\s*සිංහල උපසිරැ?සි සමඟ.*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
}

async function searchCineSubzMovies(query) {
  const searchUrl = `https://cinesubz.net/?s=${encodeURIComponent(query.trim())}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://cinesubz.net/',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`CineSubz search returned HTTP ${res.status}`);
    }

    const html = await res.text();
    const results = [];
    const seenSlugs = new Set();

    const itemRegex = /<div id="item-(\d+)" class="display-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const id = match[1];
      const block = match[2];

      const linkMatch = block.match(/href="(https:\/\/cinesubz\.[a-z]+\/movies\/([^"/]+)\/?)"/i);
      if (!linkMatch) continue;

      const url = linkMatch[1];
      const rawSlug = linkMatch[2];
      const slug = `cs:${rawSlug}`;
      if (seenSlugs.has(slug)) continue;

      const titleMatch =
        block.match(/<div class="item-desc-title">\s*<h3>([\s\S]*?)<\/h3>/i) ||
        block.match(/title="([^"]+)"/i);
      const rawTitle = titleMatch ? stripTags(titleMatch[1]) : rawSlug.replace(/-/g, ' ');
      const yearMatch = rawTitle.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : '';
      const cleanTitle = cleanMovieTitle(rawTitle);

      const imgMatch =
        block.match(/data-original="([^"]+)"/i) || block.match(/<img[^>]+src="([^"]+)"/i);
      const poster = imgMatch ? imgMatch[1].trim() : '';

      const qualityMatch = block.match(/<span class="badge-quality-corner">([^<]+)<\/span>/i);
      const quality = qualityMatch ? stripTags(qualityMatch[1]) : 'HD';

      const imdbMatch = block.match(/<span class="imdb-score">([^<]+)<\/span>/i);
      const imdb = imdbMatch ? `IMDb ${stripTags(imdbMatch[1])}` : 'Sinhala Sub';

      seenSlugs.add(slug);
      results.push({
        id,
        slug,
        url,
        title: rawTitle,
        cleanTitle,
        year,
        poster,
        quality,
        language: `CineSubz • ${imdb}`,
      });

      if (results.length >= 10) break;
    }

    // Fallback if regex missed items due to nested divs
    if (results.length === 0) {
      const linkMatches = [
        ...html.matchAll(
          /<a href="(https:\/\/cinesubz\.[a-z]+\/movies\/([^"/]+)\/?)"[^>]*title="([^"]+)"/gi
        ),
      ];
      for (const m of linkMatches) {
        const url = m[1];
        const rawSlug = m[2];
        const slug = `cs:${rawSlug}`;
        if (seenSlugs.has(slug)) continue;
        const rawTitle = decodeHtmlEntities(m[3]);
        const cleanTitle = cleanMovieTitle(rawTitle);
        const yearMatch = cleanTitle.match(/\((\d{4})\)/);
        seenSlugs.add(slug);
        results.push({
          id: String(results.length + 1),
          slug,
          url,
          title: rawTitle,
          cleanTitle,
          year: yearMatch ? yearMatch[1] : '',
          poster: '',
          quality: 'WEBRip',
          language: 'CineSubz.co',
        });
        if (results.length >= 10) break;
      }
    }

    return results;
  } finally {
    clearTimeout(timeout);
  }
}

async function getCineSubzMovieDetails(slugWithPrefix) {
  const rawSlug = slugWithPrefix.replace(/^cs:/i, '').replace(/^\/+|\/+$/g, '');
  const slug = `cs:${rawSlug}`;
  const url = `https://cinesubz.net/movies/${rawSlug}/`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://cinesubz.net/',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`CineSubz movie page returned HTTP ${res.status}`);
    }

    const html = await res.text();

    const titleMatch =
      html.match(/<div class="details-title">\s*<h3>([\s\S]*?)<\/h3>/i) ||
      html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : rawSlug;
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : '';
    const cleanTitle = cleanMovieTitle(title);

    const releaseMatch = html.match(/itemprop="dateCreated"\s+content="([^"]+)"/i);
    const releaseDate = releaseMatch ? stripTags(releaseMatch[1]) : year;

    const posterMatch =
      html.match(/<meta property="og:image"\s+content="([^"]+)"/i) ||
      html.match(/class="poster-img"\s+src="([^"]+)"/i);
    const poster = posterMatch ? posterMatch[1].trim() : '';

    const qualityMatch = html.match(/<span class="data-quality">([^<]+)<\/span>/i);
    const quality = qualityMatch ? stripTags(qualityMatch[1]) : 'WEBRip';

    const imdbMatch = html.match(/IMDb:\s*([0-9.]+)/i);
    const imdb = imdbMatch ? imdbMatch[1].trim() : 'N/A';

    const durationMatch = html.match(/itemprop=['"]duration['"][^>]*>([^<]+)<\/span>/i);
    const duration = durationMatch ? stripTags(durationMatch[1]) : 'N/A';

    const genreBlockMatch = html.match(/<div class="details-genre">([\s\S]*?)<\/div>/i);
    const genres = [];
    if (genreBlockMatch) {
      const gMatches = [...genreBlockMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
      for (const gm of gMatches) {
        genres.push(stripTags(gm[1]));
      }
    }

    const descMatch =
      html.match(/<div class="wp-content"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div class="details-desc"[^>]*>([\s\S]*?)<\/div>/i);
    let description = '';
    if (descMatch) {
      description = stripTags(descMatch[1]).slice(0, 420);
    }
    if (!description) {
      description = `${cleanTitle} Sinhala Subtitles Movie on CineSubz.co`;
    }

    // Download options are metadata only: server / quality / size.
    // The original link codes and api-page URLs are NOT included.
    const downloads = [];
    const dlRegex =
      /<div class=['"]movie-download-link-item['"][^>]*id=['"]link-row-(\d+)['"][^>]*>[\s\S]*?<a href=['"](https:\/\/cinesubz\.[a-z]+\/(?:api-|zt-links\/)[^'"]+)['"][\s\S]*?<span class=['"]movie-download-meta['"]>([\s\S]*?)<\/span>/gi;

    let dlMatch;
    while ((dlMatch = dlRegex.exec(html)) !== null) {
      const id = dlMatch[1];
      const metaText = stripTags(dlMatch[3]); // e.g. "WEBRip 480p • 750 MB • English"
      const parts = metaText.split('•').map((s) => s.trim());
      const dlQuality = parts[0] || 'HD 720p';
      const dlSize = parts[1] || '700 MB';

      downloads.push({
        id,
        server: 'CineSubz R2 Turbo ⚡',
        quality: dlQuality,
        normalizedQuality: normalizeQualityLabel(dlQuality),
        size: dlSize,
      });
    }

    const bestByQuality = {};
    for (const q of ['480p', '720p', '1080p']) {
      const candidates = downloads
        .filter((d) => d.normalizedQuality === q)
        .sort((a, b) => parseSizeMB(a.size) - parseSizeMB(b.size));
      if (candidates.length > 0) bestByQuality[q] = candidates[0];
    }

    return {
      slug,
      url,
      title,
      cleanTitle,
      year,
      releaseDate,
      poster,
      thumbPoster: poster,
      quality,
      language: 'English',
      imdb,
      duration,
      genres: genres.slice(0, 4),
      subtitleAuthor: 'CineSubz Team',
      subtitleSite: 'CineSubz.co',
      description,
      downloads,
      bestByQuality,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { searchCineSubzMovies, getCineSubzMovieDetails };
