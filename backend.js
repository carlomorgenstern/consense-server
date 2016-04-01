// Imports - every imported library starts with a capital letter
const Express = require('express')(); // import and create webserver
const Q = require('q'); // import promises functionality
const Mysql = require('mysql'); // import mysql handler
const ChildProcess = require('child_process'); // import child process

// constants
const data = {
	serverport: 8080,
	pathToUpdaterModule: 'updater.js',
	timeTillRefresh: 1000, //ms
	mysql: {
		host: 'omegainc.de',
		user: 'consense',
		password: 'Faustmann',
		database: 'consense'
	}
};

// connection pool for the mysql database
var mysqlpool = Mysql.createPool(data.mysql);

// function to updata the data from data source
var updateData = (function() {
	// timestamp for the last data refresh
	var lastRefreshTimestamp = Date.now();
	// reference to child process
	var updaterProcess = null;

	// definition of function 'updateData'
	return function(instantRefresh) {
		if (updaterProcess !== null) {
			return Q.reject('Refresh is already running');
		} else if (instantRefresh && lastRefreshTimestamp + data.timeTillRefresh >= Date.now()) {
			return Q.reject('Refresh was already requested at ' + lastRefreshTimestamp);
		} else {
			var deferred = Q.defer();

			updaterProcess = ChildProcess.fork(data.pathToUpdaterModule);
			updaterProcess.send(data.mysql);

			updaterProcess.on('message', (message) => {
				if (message === 'data_refreshed') {
					updaterProcess = null;
					deferred.resolve('Data was updated');
				}
			});
			return deferred.promise;
		}
	};
}());

// Define what happens if someone requests anything from the server
Express.get('/api/rooms', (request, response) => {
	mysqlpool.query('SELECT DISTINCT Location FROM Events', function(error, results, fields) {
		if (error) {
			console.log(error);
		}
		console.log(results);
		console.log(fields);
	})
	response.end();
});

// API request for refreshing data from the data source manually, which is limited by data.timeTillRefresh
Express.get('/api/refresh', (request, response) => {
	updateData().then(function() {
		response.status(204).end();
	}, function(error) {
		response.status(423).json({
			error: error
		});
	});
});

//  Start the server
Express.listen(data.serverport, () => {
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', data.serverport);
});

// Refresh data when starting the server
updateData();