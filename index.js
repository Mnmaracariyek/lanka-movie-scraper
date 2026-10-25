'use strict';

// lanka-movie-scraper — search + movie-details metadata from Sri Lankan
// movie sites. Metadata only: no subtitle downloads, no media downloads,
// no download-link resolvers, no API keys, no bot code.
//
// Works with both require() and import:
//   const { searchSinhalaSubMovies } = require('lanka-movie-scraper');
//   import { searchSinhalaSubMovies } from 'lanka-movie-scraper';

const { searchCineSubzMovies, getCineSubzMovieDetails } = require('./src/cinesubz');
const { searchSinhalaSubMovies, getSinhalaSubMovieDetails } = require('./src/sinhalasub');
const { searchYtsMovies, getYtsMovieDetails } = require('./src/yts');
const { searchGiniSisilaCartoons, getGiniSisilaCartoonDetails } = require('./src/ginisisila');

module.exports = {
  searchCineSubzMovies,
  getCineSubzMovieDetails,
  searchSinhalaSubMovies,
  getSinhalaSubMovieDetails,
  searchYtsMovies,
  getYtsMovieDetails,
  searchGiniSisilaCartoons,
  getGiniSisilaCartoonDetails,
};
