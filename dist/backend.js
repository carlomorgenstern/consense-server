// Imports - every imported library starts with a capital letter
'use strict';

const Express = require('express')(); // import and create webserver
Express.disable('x-powered-by'); // disable software-identifiying HTTP header

const ChildProcess = require('child_process'); // import child process
const Mysql = require('mysql'); // import mysql handler
const Schedule = require('node-schedule'); // scheduler for regularly running tasks
const Q = require('q'); // import promises functionality
const Urljoin = require('url-join'); // import sane url joiner

// constants
const data = {
	pathToUpdaterModule: 'dist/databaseUpdater.js'
};

// loading configuration object and check for required properties
var config = require('config');
if (!config.has('serverport')) {
	console.log('App configuration is missing the property "serverport" - terminating');
	return;
}
if (!config.has('apiEndpoint')) {
	console.log('App configuration is missing the property "apiEndpoint" - terminating');
	return;
}
if (!config.has('mysqlProperties')) {
	console.log('App configuration is missing the property "mysqlProperties" - terminating');
	return;
}

// connection pool for the mysql database
config.mysqlProperties.timezone = 'utc';
var mysqlpool = Mysql.createPool(config.mysqlProperties);
mysqlpool.on('error', error => {
	console.log(error);
});

// function to trigger a database update from the client
var updateData = (() => {
	// timestamp for the last data refresh
	let lastRefreshTimestamp = new Date(0);
	// reference to child process
	let updaterProcess = null;
	// manualRefreshTimeout
	let manualRefreshTimeout = 30000;
	if (config.has('manualRefreshTimeout')) {
		manualRefreshTimeout = config.manualRefreshTimeout;
	}

	// definition of function 'updateData'
	return () => {
		if (updaterProcess !== null) {
			return Q.reject('Refresh is already running');
		} else if (lastRefreshTimestamp + manualRefreshTimeout >= Date.now()) {
			return Q.reject('Refresh was already requested at ' + (new Date(lastRefreshTimestamp)).toISOString());
		} else {
			let deferred = Q.defer();

			updaterProcess = ChildProcess.fork(data.pathToUpdaterModule);
			updaterProcess.send('start');

			updaterProcess.on('message', (message) => {
				updaterProcess = null;
				if (message === 'data_refreshed') {
					deferred.resolve('Data was updated');
				} else {
					deferred.reject(message);
				}
			});
			updaterProcess.on('exit', () => {
				updaterProcess = null;
			});
			return deferred.promise;
		}
	};
})();

// all functions that interact with the database
var apiFunctions = (() => {

	// cache object
	let cache = {
		courses: null,
		speakers: null,
		rooms: null,
		events: []
	};

	let cacheSize = 30;
	if (config.has('eventCacheSize')) {
		cacheSize = config.eventCacheSize;
	}

	// an object that holds all functions that interact with the database
	// all functions return a promise which resolves with a JSON result or rejects with an error code
	return {
		getCourses: () => {
			if (cache.courses !== null) {
				return Q.resolve(cache.courses);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT UID, Name FROM Courses', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let courseArray = [];
					for (let resultObject of results) {
						courseArray.push({
							id: resultObject.UID,
							name: resultObject.Name
						});
					}

					let answer = JSON.stringify(courseArray);
					cache.courses = answer;
					deferred.resolve(answer);
				});
				return deferred.promise;
			}
		},
		getSpeakers: () => {
			if (cache.speakers !== null) {
				return Q.resolve(cache.speakers);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT UID, Name FROM Speakers', (error, results) => {
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

					let answer = JSON.stringify(speakerArray);
					cache.speakers = answer;
					deferred.resolve(answer);
				});
				return deferred.promise;
			}
		},
		getRooms: () => {
			if (cache.rooms !== null) {
				return Q.resolve(cache.rooms);
			} else {
				let deferred = Q.defer();
				mysqlpool.query('SELECT UID, Name FROM Rooms', (error, results) => {
					if (error) {
						deferred.reject(error);
						return;
					}

					let roomArray = [];
					for (let resultObject of results) {
						roomArray.push({
							id: resultObject.UID,
							name: resultObject.Name
						});
					}

					let answer = JSON.stringify(roomArray);
					cache.rooms = answer;
					deferred.resolve(answer);
				});
				return deferred.promise;
			}
		},
		getEvents: (type, id) => {
			var cacheResult = cache.events.find(cacheEntry => {
				return cacheEntry.type === type && cacheEntry.id === id;
			});
			if (cacheResult !== undefined && cacheResult !== null) {
				return Q.resolve(cacheResult.events);
			}

			var queryString = 'SELECT Events.*, Courses.UID as CourseUID, Courses.Name as CourseName, Rooms.UID as RoomUID, ' +
				'Rooms.Name as RoomName, Speakers.UID as SpeakerUID, Speakers.Name as SpeakerName FROM Events ' +
				'INNER JOIN EventToCourse ON Events.UID = EventToCourse.EventUID INNER JOIN EventToRoom ON Events.UID = EventToRoom.EventUID ' +
				'INNER JOIN EventToSpeaker ON Events.UID = EventToSpeaker.EventUID INNER JOIN Courses ON EventToCourse.CourseUID = Courses.UID ' +
				'INNER JOIN Speakers ON EventToSpeaker.SpeakerUID = Speakers.UID INNER JOIN Rooms ON EventToRoom.RoomUID = Rooms.UID ';
			if (type === 'course') {
				queryString += 'WHERE CourseUID = ?';
			} else if (type === 'speaker') {
				queryString += 'WHERE SpeakerUID = ?';
			} else if (type === 'room') {
				queryString += 'WHERE RoomUID = ?';
			} else {
				return Q.reject('Invalid input type');
			}
			queryString += ' ORDER BY Events.UID';

			let deferred = Q.defer();
			mysqlpool.getConnection((error, connection) => {
				if (error) {
					deferred.reject(error);
					return;
				}

				let query = connection.query(queryString, id);
				let eventArray = [];
				let currentEvent = null;
				query.on('error', error => {
					deferred.reject(error);
				}).on('result', row => {
					connection.pause();

					if (currentEvent === null) {
						currentEvent = {
							id: row.UID,
							title: row.Name,
							start: row.StartDate,
							end: row.EndDate,
							customEventType: row.EventType,
							customEventGroup: row.EventGroup,
							customComment: row.Comment,
							courseUIDs: [row.CourseUID],
							courseNames: [row.CourseName],
							speakerUIDs: [row.SpeakerUID],
							speakerNames: [row.SpeakerName],
							roomUIDs: [row.RoomUID],
							roomNames: [row.RoomName]
						};
					}
					if (currentEvent.id === row.UID) {
						if (!currentEvent.courseUIDs.includes(row.CourseUID)) {
							currentEvent.courseUIDs.push(row.CourseUID);
						}
						if (!currentEvent.courseNames.includes(row.CourseName)) {
							currentEvent.courseNames.push(row.CourseName);
						}
						if (!currentEvent.speakerUIDs.includes(row.SpeakerUID)) {
							currentEvent.speakerUIDs.push(row.SpeakerUID);
						}
						if (!currentEvent.speakerNames.includes(row.SpeakerName)) {
							currentEvent.speakerNames.push(row.SpeakerName);
						}
						if (!currentEvent.roomUIDs.includes(row.RoomUID)) {
							currentEvent.roomUIDs.push(row.RoomUID);
						}
						if (!currentEvent.roomNames.includes(row.RoomName)) {
							currentEvent.roomNames.push(row.RoomName);
						}
					} else {
						eventArray.push(currentEvent);
						currentEvent = {
							id: row.UID,
							title: row.Name,
							start: row.StartDate,
							end: row.EndDate,
							customEventType: row.EventType,
							customEventGroup: row.EventGroup,
							customComment: row.Comment,
							courseUIDs: [row.CourseUID],
							courseNames: [row.CourseName],
							speakerUIDs: [row.SpeakerUID],
							speakerNames: [row.SpeakerName],
							roomUIDs: [row.RoomUID],
							roomNames: [row.RoomName]
						};
					}

					connection.resume();
				}).on('end', () => {
					connection.release();
					eventArray.push(currentEvent);

					let answer = JSON.stringify(eventArray);
					cache.events.push({
						type: type,
						id: id,
						events: answer
					});

					deferred.resolve(answer);
				});
			});

			return deferred.promise;
		},
		rebuildCache: () => {
			let deferred = Q.defer();
			cache.courses = null;
			cache.speakers = null;
			cache.rooms = null;
			cache.events = [];

			Q.allSettled([apiFunctions.getCourses(), apiFunctions.getSpeakers(), apiFunctions.getRooms()])
				.done(() => {
					deferred.resolve('Cache was rebuild');
				}, error => {
					deferred.reject(error);
				});
			return deferred.promise;
		}
	};
})();

// API requests
Express.get(Urljoin(config.apiEndpoint, '/courses'), (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getCourses().done(courseJSON => {
		response.json(courseJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(Urljoin(config.apiEndpoint, '/rooms'), (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getRooms().done(roomJSON => {
		response.json(roomJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(Urljoin(config.apiEndpoint, '/speakers'), (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	apiFunctions.getSpeakers().done(speakerJSON => {
		response.json(speakerJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

Express.get(Urljoin(config.apiEndpoint, '/events/:type/:id'), (request, response) => {
	// TODO Handle query parameters
	response.set("Access-Control-Allow-Origin", "*");

	if (Object.getOwnPropertyNames(request.params).length === 0 || !['course', 'speaker', 'room'].includes(request.params.type)) {
		response.status(400).json({
			error: 'Invalid type for event request'
		});
		return;
	}

	apiFunctions.getEvents(request.params.type, request.params.id).done(responseJSON => {
		response.json(responseJSON);
	}, error => {
		console.log(error);
		response.status(500).end();
	});
});

// API request for refreshing data from the data source manually
Express.get(Urljoin(config.apiEndpoint, '/refresh'), (request, response) => {
	response.set("Access-Control-Allow-Origin", "*");
	updateData().then(apiFunctions.rebuildCache).done(() => {
		response.status(204).end();
	}, error => {
		console.log(error);
		response.status(423).json({
			error: error
		});
	});
});

//  Start the server
var server = Express.listen(config.serverport, () => {
	console.log('Server gestartet im Modus:', process.env.NODE_ENV);
});

// Run the database updater every 3 hours and on startup
Schedule.scheduleJob('* * */3 * * *', runDatabaseUpdater);
runDatabaseUpdater();

function runDatabaseUpdater() {
	updateData().then(apiFunctions.rebuildCache).catch(error => {
		console.log(error);
	});
}

// Gracefully shutdown the server
var gracefulShutdown = function() {
	console.log("Received kill signal, shutting down gracefully.");
	mysqlpool.end(error => {
		if (error) {
			console.log(error);
		}

		server.close(() => {
			console.log("Closed out remaining connections.");
			process.exit();
		});
	});

	setTimeout(function() {
		console.error("Could not close connections in time, forcefully shutting down.");
		process.exit();
	}, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// TODO Logging with winston
// TODO Sessions persistieren und Tokenizen
// TODO Mails Versenden