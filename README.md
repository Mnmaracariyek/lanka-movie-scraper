# lanka-movie-scraper

Search and fetch **movie metadata** from Sri Lankan movie sites — no API keys, no bot code, zero dependencies (Node 18+).

**Metadata only.** This package does NOT download subtitle files, media files, or torrents, and it does NOT resolve direct download/stream URLs. The `downloads` lists in details results describe release options only (server, quality, size) — they contain no links.

## Install

```bash
npm install lanka-movie-scraper
```

## Usage

```js
const {
  searchCineSubzMovies,
  getCineSubzMovieDetails,
  searchSinhalaSubMovies,
  getSinhalaSubMovieDetails,
  searchYtsMovies,
  getYtsMovieDetails,
  searchGiniSisilaCartoons,
  getGiniSisilaCartoonDetails,
} = require('lanka-movie-scraper');
```

Works with `import` too:

```js
import { searchSinhalaSubMovies } from 'lanka-movie-scraper';
```

### CineSubz

```js
const results = await searchCineSubzMovies('avengers');
// [{ id, slug: 'cs:...', url, title, cleanTitle, year, poster, quality, language }]

const details = await getCineSubzMovieDetails(results[0].slug);
// { slug, url, title, cleanTitle, year, releaseDate, poster, thumbPoster,
//   quality, language, imdb, duration, genres, subtitleAuthor, subtitleSite,
//   description, downloads, bestByQuality }
```

### SinhalaSub

```js
const results = await searchSinhalaSubMovies('spider man');
const details = await getSinhalaSubMovieDetails(results[0].slug);
// Same shape as CineSubz details. Accepts a slug or a full
// https://sinhalasub.lk/movies/... URL.
```

### YTS

```js
const results = await searchYtsMovies('dune');
// [{ id, slug: 'yts:12345', url, title, cleanTitle, year, poster, quality, language }]

const details = await getYtsMovieDetails(results[0].slug);
// Same shape as above, plus seeds/peers on each downloads entry.
// YTS details come from the public YTS API (tried across mirrors).
```

### GiniSisila cartoons (Sinhala dubbed)

```js
const results = await searchGiniSisilaCartoons('bheem');
// [{ id, slug: 'gs:123', url, title, cleanTitle, poster, quality, ... }]
// Note: search results carry the channel in `year` and the
// channel/views string in `imdb`, as in the original bot code.

const details = await getGiniSisilaCartoonDetails(results[0].slug);
// { slug, url, title, cleanTitle, year (channel), releaseDate, country,
//   runtime, imdb, genres, synopsis, poster, thumbPoster,
//   downloads, bestByQuality }
// Note: GiniSisila details use `synopsis` instead of `description`.
```

## Result shapes

**Search result** (CineSubz / SinhalaSub / YTS):

```js
{
  id: '123',
  slug: 'cs:avengers-endgame-2019-sinhala-subtitles',
  url: 'https://cinesubz.net/movies/...',
  title: 'Avengers Endgame (2019) | Sinhala Subtitles',
  cleanTitle: 'Avengers Endgame',
  year: '2019',
  poster: 'https://...jpg',
  quality: 'WEBRip',
  language: 'CineSubz • IMDb 8.4',
}
```

**Details result** adds: `releaseDate`, `thumbPoster`, `duration`, `genres`,
`subtitleAuthor`, `subtitleSite`, `description`, `downloads`, `bestByQuality`.

**Downloads entry** (metadata only, no links):

```js
{ id: '1', server: 'Pixeldrain', quality: 'HD 720p', normalizedQuality: '720p', size: '850 MB' }
```

`bestByQuality` maps `'480p' | '720p' | '1080p'` to the best (smallest-file, fastest-server) entry for that quality, when available.

## Notes

- Scraped sites change their HTML from time to time — if a search suddenly returns `[]`, the site's markup probably changed.
- Be polite: these functions are meant for occasional lookups, not bulk scraping.
- Extracted and cleaned up from the [Queen Senaya MD](https://github.com/Mnmaracariyek/queen-senaya-md-bot) WhatsApp bot's scrapers, with all bot, download-resolver, streaming and credential code removed.

## License

MIT
