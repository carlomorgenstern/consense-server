// This is the script responsible for updating all events from the data source
// It is started as a seperate process by the backend when needed, so the computational work does not block the api service

// Imports
const Urljoin = require('url-join'); // import sane url joiner
const Q = require('q'); // import promises functionality
const Qhttp = require('q-io/http'); // import http with promises
const StripBom = require('strip-bom'); // import bom-stripper needed for ical.js
const Ical = require('ical.js'); // import ical parser
const Mysql = require('mysql'); // import mysql handler

// constants for defining the data source
const dataSource = {
	icsMoodleUrlBase: 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/',
	preSemesterString: 'semester',
	preCourseString: 'kurs',
	majors: ['wi', 'bank', 'tourismus', 'iba', 'ppm'], // holds majors whose schedules are to be fetched
	semesters: 6, // how many semester are to be crawled per major and majors
	courses: ['a', 'b', 'c', ''] // courses in a given major, e.g. WI13a, WI13b etc.
};

// holder for mysqlpool
var mysqlpool;

// ** download a file from a given URL and return a promise resolved with the icsdata
var downloadFromUrl = function(fileUrl) {
	return Qhttp.request(fileUrl)
		.then(function(htmlResponse) {
			return htmlResponse.body.read();
		})
		.then(function(fileContent) {
			fileContent = StripBom(fileContent.toString()); // strip BOM from file, so startWith works and Ical.js can parse correctly later
			if (!fileContent.startsWith('<script type')) {
				return Q.resolve(fileContent);
			} else {
				return Q.reject('Found response is not an ICS-File.');
			}
		});
};

// ** parse a given ICS file into the database
var parseIcsIntoDatabase = function(fileContent) {
	var deferred = Q.defer();
	var icalComp = new Ical.Component(Ical.parse(fileContent)); // parse ical and instantiate ical component
	var vevents = icalComp.getAllSubcomponents('vevent'); // get all vevents from the ical
	var parsedEvents = []; // holding parsed values to batch insert into database
	for (var i = 0; i < vevents.length; i++) {
		var event = new Ical.Event(vevents[i]);

		// extract and parse the needed properties: UID, Location, Description, DTSTART, DTEND
		// UID parsing
		var uid = undefined,
			startDate = undefined,
			endDate = undefined,
			location = undefined,
			type = undefined,
			eventName = undefined,
			eventGroup = undefined,
			comment = undefined,
			speaker = undefined;
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

		// Location parsing
		if (event.location !== null) {
			location = event.location;
		} else {
			console.log('event.location not present - skipping event ' + uid);
			continue;
		}

		// Description parsing
		if (event.description !== null) {
			var descriptionElements = event.description.split('\n');
			for (var element of descriptionElements) {
				var value = element.substring(element.indexOf(':') + 1).trim();
				if (value == '-') {
					value = '';
				}
				if (element.startsWith('Art:')) {
					type = value;
				} else if (element.startsWith('Veranstaltung:')) {
					eventName = value;
				} else if (element.startsWith('Veranstaltungsuntergruppe:')) {
					eventGroup = value;
				} else if (element.startsWith('Anmerkung:')) {
					comment = value;
				} else if (element.startsWith('Dozent:')) {
					speaker = value;
				}
			}
			if (type === undefined || eventName === undefined || eventGroup === undefined || comment === undefined || speaker === undefined) {
				console.log('could not parse all fields from event.description - skipping event ' + uid);
				console.log(event.toString());
			}
		} else {
			console.log('event.description not present - skipping event ' + uid);
			continue;
		}
		parsedEvents.push([uid, startDate, endDate, location, type, eventName, eventGroup, comment, speaker]);
	}
	var sqlcommand = 'INSERT INTO Events (UID, StartDate, EndDate, Location, Type, EventName, EventGroup, Comment, Speaker) ' +
		'VALUES ? ON DUPLICATE KEY UPDATE StartDate=VALUES(StartDate), EndDate=VALUES(EndDate), Location=VALUES(Location), Type=VALUES(Type), EventName=VALUES(EventName), EventGroup=VALUES(EventGroup), Comment=VALUES(Comment), Speaker=VALUES(Speaker);';
	mysqlpool.query(sqlcommand, [parsedEvents], function(error, rows) {
		if (error) {
			deferred.reject(error);
		}
		console.log(rows);
		deferred.resolve('database update successfull');
	});
	return deferred.promise;
};

process.on('message', (message) => {
	if (message.host !== undefined && message.user !== undefined) {
		var promises = [];
		mysqlpool = Mysql.createPool(message);
		for (var major of dataSource.majors) {
			for (var semester = 1; semester <= dataSource.semesters; semester++) {
				for (var course of dataSource.courses) {
					// Download ICS files: Pattern = {baseURL}+{major}+'/semester'+{integer}+'/kurs'+{courseLetter}
					var downloadUrl = Urljoin(dataSource.icsMoodleUrlBase, major, dataSource.preSemesterString + semester, dataSource.preCourseString + course);
					var promise = downloadFromUrl(downloadUrl).then(parseIcsIntoDatabase, (err) => {
						console.log("error: " + err);
					});
					promises.push(promise);
				}
			}
		}
		Q.all(promises).done(function() {
			process.send('data_refreshed');
			process.exit(0);
		});
	}
});