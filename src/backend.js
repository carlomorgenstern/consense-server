// Imports - every imported library starts with a capital letter
'use strict';

const Express = require('express')(); // import and create webserver
Express.disable('x-powered-by'); // disable software-identifiying HTTP header

const ChildProcess = require('child_process'); // import child process
const Mysql = require('mysql'); // import mysql handler
const Q = require('q'); // import promises functionality

// constants
const data = {
	pathToUpdaterModule: 'databaseUpdater.js'
};

// configuration object
var config = require('./config.js');

// connection pool for the mysql database
var mysqlpool = Mysql.createPool(config.mysqlProperties);

// function to trigger a database update from the client
var updateData = (() => {
	// timestamp for the last data refresh
	let lastRefreshTimestamp = Date.now();
	// reference to child process
	let updaterProcess = null;

	// definition of function 'updateData'
	return () => {
		if (updaterProcess !== null) {
			return Q.reject('Refresh is already running');
		} else if (lastRefreshTimestamp + config.manualRefreshTimeout >= Date.now()) {
			return Q.reject('Refresh was already requested at ' + lastRefreshTimestamp);
		} else {
			let deferred = Q.defer();

			updaterProcess = ChildProcess.fork(data.pathToUpdaterModule);

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
	// TODO Cache for events with object that supports DeleteOldest and configurable size
	let cache = {
		courses: null,
		speakers: null,
		rooms: null,
		events: null
	};

	// an object that holds all functions that interact with the database
	// all functions return a promise which resolves with a JSON result or rejects with an error code
	return {
		getCourses: () => {
			if (cache.courses !== null) {
				return Q.resolve(cache.rooms);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT UID, Name FROM Courses', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let locationArray = [];
					for (let resultObject of results) {
						locationArray.push({
							id: resultObject.UID,
							name: resultObject.Name
						});
					}
					// TODO JSON.stringify??
					deferred.resolve(JSON.stringify(locationArray));
				});
				return deferred.promise;
			}
		},
		getSpeakers: () => {
			if (cache.speakers !== null) {
				return Q.resolve(cache.speakers);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT DISTINCT UID, Name FROM Speakers', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let speakerArray = [];
					for (let resultObject of results) {
						speakerArray.push({
							id: resultObject.UID,
							name: resultObject.Name
						});
					}
					// TODO JSON.stringify??
					deferred.resolve(JSON.stringify(speakerArray));
				});
				return deferred.promise;
			}
		},
		getRooms: () => {
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
					// TODO JSON.stringify??
					deferred.resolve(JSON.stringify(locationArray));
				});
				return deferred.promise;
			}
		},
		getEvents: (type, uid) => {
			var queryString;
			if (type === 'course') {
				queryString = 'SELECT * FROM Events WHERE CourseUID = ?';
			} else if (type === 'speaker') {
				queryString = 'SELECT * FROM Events WHERE SpeakerUID = ?';
			} else if (type === 'room')  {
				queryString = 'SELECT * FROM Events WHERE RoomUID = ?';
			} else {
				return Q.reject('Invalid input type');
			}

			let deferred = Q.defer();
			mysqlpool.query(queryString, [uid], (error, results) => {
				if (error) {
					deferred.reject(error);
					return;
				}

				// TODO JSON.stringify??
				deferred.resolve(JSON.stringify(results));
			});
			return deferred.promise;
		},
		rebuildCache: () => {
			cache.courses = null;
			cache.speakers = null;
			cache.rooms = null;
			cache.events = null;

			apiFunctions.getCourses().then(courseJSON => {
				cache.rooms = courseJSON;
			}, error => {
				console.log(error);
			});

			apiFunctions.getSpeakers().then(speakerJSON => {
				cache.speakers = speakerJSON;
			}, error => {
				console.log(error);
			});

			apiFunctions.getRooms().then(roomJSON => {
				cache.rooms = roomJSON;
			}, error => {
				console.log(error);
			});
		}
	};
})();

// API requests
Express.get(config.apiEndpoint+'/courses', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getCourses().then(courseJSON => {
		response.json(courseJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(config.apiEndpoint+'/rooms', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getRooms().then(roomJSON => {
		response.json(roomJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(config.apiEndpoint+'/speakers', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getSpeakerChoices().then(speakerJSON => {
		response.json(speakerJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(config.apiEndpoint+'events', (request, response) => {
	// TODO Handle query parameters
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getEvents('type', 'uid').then(responseJSON => {
		response.json(responseJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

// API request for refreshing data from the data source manually, which is limited by config.manualRefreshTimout
Express.get('/api/refresh', (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	updateData().then(() => {
		apiFunctions.rebuildCache();
		response.status(204).end();
	}, error => {
		console.log(error);
		response.status(423).json({
			error: error
		});
	});
});

//  Start the server
Express.listen(config.serverport, () => {
	console.log('Server gestartet im Modus:', process.env.NODE_ENV);
});

// TODO Logging with winston or pm2?
// TODO Logging in with OpenIDConnect or Oauth2?
// TODO Sessions persistieren und Tokenizen
// TODO Mails Versenden
// TODO Config mit node config?