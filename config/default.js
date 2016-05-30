'use strict';

module.exports = {
	// port the app server should listen on
	serverport: 3500,

	// endpoint for the api requests
	apiEndpoint: '/api',

	// timeout for clients to request a manual update from the data source (default: 30s)
	manualRefreshTimeout: 30000, // ms

	// connection properties for the mysql database connection pool
	// see https://www.npmjs.com/package/mysql#connection-options for all accepted properties
	mysqlProperties: {
		host: 'omegainc.de',
		user: 'consense',
		password: 'Faustmann',
		database: 'consense'
	},

	// size of the cache (in count of responses) for requests of events by course, speaker or room (default: 30)
	eventCacheSize: 30
};