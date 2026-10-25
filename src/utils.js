'use strict';

// Shared HTML helpers used by all sources. Pure string functions, no deps.

function decodeHtmlEntities(input) {
  if (!input) return '';
  return input
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '));
}

function normalizeQualityLabel(raw) {
  const q = String(raw || '').toLowerCase();
  if (q.includes('480')) return '480p';
  if (q.includes('720')) return '720p';
  if (q.includes('1080')) return '1080p';
  return 'other';
}

// "1.2 GB" / "750 MB" -> megabytes, for sorting smallest-first.
function parseSizeMB(s) {
  const m = String(s || '').match(/([0-9.]+)\s*(GB|MB)/i);
  if (!m) return 9999;
  const val = parseFloat(m[1]);
  return m[2].toUpperCase() === 'GB' ? val * 1024 : val;
}

module.exports = { decodeHtmlEntities, stripTags, normalizeQualityLabel, parseSizeMB };
