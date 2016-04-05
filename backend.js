// Imports - every imported library starts with a capital letter
const Express = require('express')(); // import and create webserver
Express.disable('x-powered-by');

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

// all functions that interact with the database
var apiFunctions = (function() {
	// cache object
	var cache = {
		rooms: null,
		speakers: null
	};

	// an object that holds all functions that interact with the database
	// all functions return a promise which resolves with a JSON result or reject with an error code
	return {
		getRoomChoices: function() {
			if (cache.rooms !== null) {
				return Q.resolve(cache.rooms);
			} else {
				var deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT Location FROM Events', function(error, results) {
					if (error) {
						deferred.reject(error);
						return;
					}

					var locationArray = [];
					for (var resultObject of results) {
						locationArray.push(resultObject.Location);
					}
					deferred.resolve(JSON.stringify(locationArray));
				});
				return deferred.promise;
			}
		},
		getSpeakerChoices: function() {
			if (cache.speakers !== null) {
				return Q.resolve(cache.speakers);
			} else {
				var deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT Speaker FROM Events', function(error, results) {
					if (error) {
						deferred.reject(error);
						return;
					}

					var speakerArray = [];
					for (var resultObject of results) {
						speakerArray.push(resultObject.Speaker);
					}
					deferred.resolve(JSON.stringify(speakerArray));
				});
				return deferred.promise;
			}
		},
		rebuildCache: function() {
			cache.rooms = null;
			cache.speakers = null;

			apiFunctions.getRoomChoices().then(function(roomJSON) {
				cache.rooms = roomJSON;
			}, function(error) {
				console.log(error);
			});

			apiFunctions.getSpeakerChoices().then(function(speakerJSON) {
				cache.speakers = speakerJSON;
			}, function(error) {
				console.log(error);
			});
		}
	};
}());

// API request for getting all possible rooms
Express.get('/api/rooms', (request, response) => {
	apiFunctions.getRoomChoices().then(function(roomJSON) {
		response.json(roomJSON);
	}, function(error) {
		console.log(error);
		response.status(500).end();
	});
});

// API request for getting all possible speakers
Express.get('/api/speakers', (request, response) => {
	apiFunctions.getSpeakerChoices().then(function(speakerJSON) {
		response.json(speakerJSON);
	}, function(error) {
		console.log(error);
		response.status(500).end();
	});
});

// API request for refreshing data from the data source manually, which is limited by data.timeTillRefresh
Express.get('/api/refresh', (request, response) => {
	updateData().then(function() {
		apiFunctions.rebuildCache();
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
updateData().then(apiFunctions.rebuildCache);