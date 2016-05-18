// Imports - every imported library starts with a capital letter
'use strict';

const Express = require('express')(); // import and create webserver
Express.disable('x-powered-by'); // disable software-identifiying HTTP header

const ChildProcess = require('child_process'); // import child process
const Mysql = require('mysql'); // import mysql handler
const Q = require('q'); // import promises functionality

// constants
const data = {
	serverport: 8080,
	pathToUpdaterModule: 'databaseUpdater.js',
	manualRefreshTimeout: 1000, //ms
	mysql: { // database connection properties
		host: 'omegainc.de',
		user: 'consense',
		password: 'Faustmann',
		database: 'consense'
	}
};

// connection pool for the mysql database
var mysqlpool = Mysql.createPool(data.mysql);

// function to trigger a database update from the client
var updateData = (() => {
	// timestamp for the last data refresh
	let lastRefreshTimestamp = Date.now();
	// reference to child process
	let updaterProcess = null;

	// definition of function 'updateData'
	return instantRefresh => {
		if (updaterProcess !== null) {
			return Q.reject('Refresh is already running');
		} else if (instantRefresh && lastRefreshTimestamp + data.manualRefreshTimeout >= Date.now()) {
			return Q.reject('Refresh was already requested at ' + lastRefreshTimestamp);
		} else {
			let deferred = Q.defer();

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
})();

// all functions that interact with the database
var apiFunctions = (() => {
	// cache object
	let cache = {
		rooms: null,
		speakers: null
	};

	// an object that holds all functions that interact with the database
	// all functions return a promise which resolves with a JSON result or rejects with an error code
	return {
		getRoomChoices: () => {
			if (cache.rooms !== null) {
				return Q.resolve(cache.rooms);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT Location FROM Events', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let locationArray = [];
					for (let resultObject of results) {
						locationArray.push(resultObject.Location);
					}
					deferred.resolve(JSON.stringify(locationArray));
				});
				return deferred.promise;
			}
		},
		getSpeakerChoices: () => {
			if (cache.speakers !== null) {
				return Q.resolve(cache.speakers);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT Speaker FROM Events', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let speakerArray = [];
					for (let resultObject of results) {
						speakerArray.push(resultObject.Speaker);
					}
					deferred.resolve(JSON.stringify(speakerArray));
				});
				return deferred.promise;
			}
		},
		getEventsForRoom: roomName => {
			let deferred = Q.defer();
			mysqlpool.query('SELECT * FROM Events WHERE Location = ?', [roomName], (error, results) => {
				if (error) {
					deferred.reject(error);
					return;
				}

				deferred.resolve(JSON.stringify(results));
			});
			return deferred.promise;
		},
		getEventsForSpeaker: speakerName => {
			let deferred = Q.defer();
			mysqlpool.query('SELECT * FROM Events WHERE Speaker = ?', [speakerName], (error, results) => {
				if (error) {
					deferred.reject(error);
					return;
				}

				deferred.resolve(JSON.stringify(results));
			});
			return deferred.promise;
		},
		rebuildCache: () => {
			cache.rooms = null;
			cache.speakers = null;

			apiFunctions.getRoomChoices().then(roomJSON => {
				cache.rooms = roomJSON;
			}, error => {
				console.log(error);
			});

			apiFunctions.getSpeakerChoices().then(speakerJSON => {
				cache.speakers = speakerJSON;
			}, error => {
				console.log(error);
			});
		}
	};
})();

// API request for getting all possible rooms
Express.get('/api/rooms', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getRoomChoices().then(roomJSON => {
		response.json(roomJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get('/api/room/:base64Room', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getEventsForRoom(new Buffer(request.params.base64Room.toString(), 'base64').toString('utf8')).then(roomJSON => {
		response.json(roomJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

// API request for getting all possible speakers
Express.get('/api/speakers', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getSpeakerChoices().then(speakerJSON => {
		response.json(speakerJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get('/api/speaker/:base64Speaker', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getEventsForSpeaker(new Buffer(request.params.base64Speaker, 'base64').toString('utf8')).then(speakerJSON => {
		response.json(speakerJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

// API request for refreshing data from the data source manually, which is limited by data.timeTillRefresh
Express.get('/api/refresh', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	updateData().then(() => {
		apiFunctions.rebuildCache();
		response.status(204).end();
	}, error => {
		response.status(423).json({
			error: error
		});
	});
});

//  Start the server
Express.listen(data.serverport, () => {
	console.log('Server erzeugt. Erreichbar unter http://localhost:', data.serverport);
	console.log('Server gestartet im Modus:', process.env.NODE_ENV);
});

// Refresh data when starting the server
// updateData().then(apiFunctions.rebuildCache);