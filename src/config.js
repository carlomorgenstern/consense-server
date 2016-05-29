'use strict';

module.exports = {
	// port the app server should listen on
	serverport: 3500,

	// endpoint for the api requests
	apiEndpoint: '/api',
	
	// timeout for clients to request a manual update from the data source
	manualRefreshTimeout: 5000, // ms
	
	// connection properties for the mysql database connector
	// see ???? for all accepted properties
	mysqlProperties: {
		host: 'omegainc.de',
		user: 'consense',
		password: 'Faustmann',
		database: 'consense'
	}
};