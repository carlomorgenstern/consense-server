// This is the script responsible for updating all events from the data source
// It is started as a seperate process by the backend when needed, so the computational work does not block the api service
'use strict';

// Imports
const Ical = require('ical.js'); // import ical parser
const Mysql = require('mysql'); // import mysql handler
const Q = require('q'); // import promises functionality
const Qhttp = require('q-io/http'); // import http with promises
const StripBom = require('strip-bom'); // import bom-stripper needed for ical.js
const Urljoin = require('url-join'); // import sane url joiner

// constants for defining the data source
const dataSource = {
	icsMoodleUrlBase: 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/',
	preSemesterString: 'semester',
	preCourseString: 'kurs',
	majors: ['bank', 'bauwesen', 'dl', 'elektrotechnik', 'fm', 'handel', 'iba', 'immobilien', 'industrie', 'informatik', 'maschinenbau', 'ppm', 'spedition', 'tourismus', 'versicherung', 'wi'], // holds majors whose schedules are to be fetched
	semesters: 6, // how many semester are to be crawled per major and majors
	courses: ['a', 'b', 'c', ''] // courses in a given major, e.g. WI13a, WI13b etc.
};

// loading configuration object and check for required properties
var config = require('config');
if (!config.has('mysqlProperties')) {
	console.log('App configuration is missing the property "mysqlProperties" - terminating');
	process.send('error initializing updater');
	process.exit(0);
}

// connection pool for the mysql database
config.mysqlProperties.timezone = 'utc';
var mysqlpool = Mysql.createPool(config.mysqlProperties);
mysqlpool.on('error', logError);

// kicks of the updating process after receiving a start message
process.on('message', (message) => {
	if (message !== 'start') {
		console.log('A message other than "start" was recieved - terminating');
		process.send('wrong start message');
		process.exit(0);
		return;
	}

	let promises = [];
	for (let major of dataSource.majors) {
		for (let semester = 1; semester <= dataSource.semesters; semester++) {
			for (let course of dataSource.courses) {
				// Download ICS files: Pattern = {baseURL}+{major}+'/semester'+{integer}+'/kurs'+{courseLetter}
				let downloadUrl = Urljoin(dataSource.icsMoodleUrlBase, major, dataSource.preSemesterString + semester, dataSource.preCourseString + course);

				let courseString = major + ' ' + semester + '. Semester';
				courseString = courseString.charAt(0).toUpperCase() + courseString.slice(1);
				if (course) {
					courseString = courseString + ' Kurs ' + course.toUpperCase();
				}
				let promise = downloadFromUrl(downloadUrl, courseString).then(parseIcsIntoDatabase, logError);
				promises.push(promise);
			}
		}
	}
	Q.allSettled(promises).fin(() => {
		process.send('data_refreshed');
		mysqlpool.end(error => {
			console.log(error);
			process.exit(0);
		});
	});
});

// download a file from a given URL and return a promise resolved with the icsdata
function downloadFromUrl(fileUrl, courseString) {
	function tryDownload(fileUrl, retries) {
		let deferred = Q.defer();
		Qhttp.request({
				url: fileUrl,
				timeout: 10000
			})
			.then(htmlResponse => {
				return deferred.resolve(htmlResponse.body.read());
			}, () => {
				if (retries > 0) {
					tryDownload(fileUrl, retries - 1).then(fileContent => {
						deferred.resolve(fileContent);
					});
				} else {
					return deferred.reject('Out of retries for downloading: ' + fileUrl);
				}
			});
		return deferred.promise;
	}

	return tryDownload(fileUrl, 10).then(fileContent => {
		fileContent = StripBom(fileContent.toString()); // strip BOM from file, so startWith works and Ical.js can parse correctly later
		if (!fileContent.startsWith('<script type')) {
			return Q.resolve({
				course: courseString,
				content: fileContent
			});
		} else {
			return Q.reject('Response is not an .ICS file: ' + fileUrl);
		}
	}, error => {
		return Q.reject(error);
	});
}

// parse a given ICS file into the database
function parseIcsIntoDatabase(file) {
	let deferred = Q.defer();
	let vevents = (new Ical.Component(Ical.parse(file.content))).getAllSubcomponents('vevent'); // parse ical and get all vevents from the ical
	let parsedEvents = []; // holding parsed values to batch insert into database
	let eventUIDs = [],
		parsedSpeakers = [],
		parsedRooms = [];

	// parse through each event
	for (let i = 0; i < vevents.length; i++) {
		let event = new Ical.Event(vevents[i]);

		// extract and parse the needed properties: UID, DTSTART, DTEND, Room, Description
		// UID parsing
		let uid, startDate, endDate, name, eventType, eventGroup, comment;
		if (event.uid !== null && isNaN(event.uid.replace('sked.de'))) {
			uid = event.uid.replace('sked.de', '');
			if (isNaN(uid)) {
				console.log('event.uid is not a number after parsing - skipping event: ' + uid);
				continue;
			}
		} else {
			console.log('event.uid not present - skipping event');
			continue;
		}

		// Start date parsing and converting to MYSQL DateTime
		if (event.startDate !== null) {
			startDate = event.startDate.toJSDate().toISOString().slice(0, 19).replace('T', ' ');
		} else {
			console.log('event.startDate not present - skipping event ' + uid);
			continue;
		}

		// Start date parsing and converting to MYSQL DateTime
		if (event.endDate !== null) {
			endDate = event.endDate.toJSDate().toISOString().slice(0, 19).replace('T', ' ');
		} else {
			console.log('event.endDate not present - skipping event ' + uid);
			continue;
		}

		// room parsing
		if (event.location !== null) {
			let rooms = event.location.replace(/CL\:/g, '').split(',');
			for (let room of rooms) {
				room = room.trim();
				if (room !== '' && room !== '-') {
					parsedRooms.push({
						eventUID: uid,
						roomName: room
					});
				}
			}
		} else {
			console.log('event.location not present - skipping event ' + uid);
			continue;
		}

		// Description parsing
		if (event.description !== null) {
			let descriptionElements = event.description.split('\n');
			for (let element of descriptionElements) {
				let value = element.substring(element.indexOf(':') + 1).trim();
				if (value == '-') {
					value = null;
				}
				if (element.startsWith('Veranstaltung:')) {
					name = value;
				} else if (element.startsWith('Art:')) {
					eventType = value;
				} else if (element.startsWith('Veranstaltungsuntergruppe:')) {
					eventGroup = value;
				} else if (element.startsWith('Anmerkung:')) {
					comment = value;
				} else if (element.startsWith('Dozent:')) {
					let speakers = value.split(',');
					for (let speaker of speakers) {
						speaker = speaker.trim();
						if (speaker !== '' || speaker !== '-') {
							parsedSpeakers.push({
								eventUID: uid,
								speakerName: speaker
							});
						}
					}
				}
			}
		} else {
			console.log('event.description not present - skipping event ' + uid);
			continue;
		}
		parsedEvents.push([uid, startDate, endDate, name, eventType, eventGroup, comment]);
		eventUIDs.push(uid);
	}

	// insert events
	let eventDeferred = Q.defer();
	let sqlcommand = 'INSERT INTO Events (UID, StartDate, EndDate, Name, EventType, EventGroup, Comment) ' +
		'VALUES ? ON DUPLICATE KEY UPDATE StartDate=VALUES(StartDate), EndDate=VALUES(EndDate), Name=VALUES(Name), EventType=VALUES(EventType), EventGroup=VALUES(EventGroup), Comment=VALUES(Comment);';
	mysqlpool.query(sqlcommand, [parsedEvents], (error) => {
		if (error) {
			eventDeferred.reject(error);
		} else {
			eventDeferred.resolve('Database update successfull');
		}
	});

	// insert course and relate to events
	insertAndGetUID('Courses', file.course).done(UID => {
		for (let eventUID of eventUIDs) {
			insertIntoRelationTable('EventToCourse', 'CourseUID', eventUID, UID).catch(logError);
		}
	}, logError);

	// insert parsed speakers and relate to determined events
	for (let parsedSpeaker of parsedSpeakers) {
		insertAndGetUID('Speakers', parsedSpeaker.speakerName).done(UID => {
			insertIntoRelationTable('EventToSpeaker', 'SpeakerUID', parsedSpeaker.eventUID, UID).catch(logError);
		}, logError);
	}

	// insert parsed rooms and relate to determined events
	for (let parsedRoom of parsedRooms) {
		insertAndGetUID('Rooms', parsedRoom.roomName).done(UID => {
			insertIntoRelationTable('EventToRoom', 'RoomUID', parsedRoom.eventUID, UID).catch(logError);
		}, logErrorc);
	}

	return deferred.promise;
}

function insertAndGetUID(table, entry) {
	table = Mysql.escapeId(table);
	let deferred = Q.defer();
	mysqlpool.query('INSERT IGNORE INTO ' + table + ' (Name) VALUES (?)', [entry], error => {
		if (error) {
			deferred.reject(error);
			return;
		}

		mysqlpool.query('SELECT UID FROM ' + table + ' WHERE Name = ?', [entry], (error, result) => {
			if (error) {
				deferred.reject(error);
				return;
			}

			deferred.resolve(result[0].UID);
		});
	});
	return deferred.promise;
}

function insertIntoRelationTable(table, typeUIDName, eventUID, typeUID) {
	table = Mysql.escapeId(table);
	typeUIDName = Mysql.escapeId(typeUIDName);
	let deferred = Q.defer();
	mysqlpool.query('INSERT IGNORE INTO ' + table + ' (EventUID, ' + typeUIDName + ') VALUES (?)', [
		[eventUID, typeUID]
	], error => {
		if (error) {
			deferred.reject(error);
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
}

function logError(error) {
	console.log("error: " + error);
}