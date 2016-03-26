// Imports - every imported library starts with a capital letter
var Express = require('express')(); // import webserver

var Urljoin = require('url-join'); // import sane url joiner

var Q = require('q'); // import promises functionality
var Qhttp = require('q-io/http'); // import http with promises

var StripBom = require('strip-bom'); // import bom-stripper needed for ical.js
var Ical = require('ical.js'); // import ical parser

var Mysql = require('mysql'); //import mysql handler

// constants
const data = {
	serverport: 8080,
	dataSource: {
		icsMoodleUrlBase: 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/',
		preSemesterString: 'semester',
		preCourseString: 'kurs',
		majors: ['wi', 'bank', 'tourismus', 'iba', 'ppm'], // holds majors whose schedules are to be fetched
		semesters: 6, // how many semester are to be crawled per major and majors
		courses: ['a', 'b', 'c', ''] // courses in a given major, e.g. WI13a, WI13b etc.
	}
};

// create a connection pool for the mysql database
var mysqlpool = Mysql.createPool({
	host: 'omegainc.de',
	user: 'consense',
	password: 'Faustmann',
	database: 'consense'
});

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
	mysqlpool.query(sqlcommand, [parsedEvents], function(err, rows) {
		if (err) {
			console.log(err);
		}
		console.log(rows);
	});
};

// Define what happens if someone requests anything from the server
Express.get('/', function(request, response) {
	// Fill array with courses (Studiengänge) from text file
	console.log('Start processing course data');

	for (var major of data.dataSource.majors) {
		for (var semester = 1; semester <= data.dataSource.semesters; semester++) {
			for (var course of data.dataSource.courses) {
				// Download ICS files: Pattern = {baseURL}+{major}+'/semester'+{integer}+'/kurs'+{courseLetter}
				var downloadUrl = Urljoin(data.dataSource.icsMoodleUrlBase, major, data.dataSource.preSemesterString + semester, data.dataSource.preCourseString + course);
				console.log('Trying to download: ' + downloadUrl);
				downloadFromUrl(downloadUrl)
					.then(parseIcsIntoDatabase);
			}
		}
	}

	console.log('Finished processing course data');
	response.end();
});

//  Start the server
Express.listen(data.serverport, function() {
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', data.serverport);
});