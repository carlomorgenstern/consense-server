// Imports - every imported library starts with a capital letter
var Express = require("express")(); // import webserver

var Path = require("path"); // import internal path validator
var Urljoin = require("url-join"); // import sane url joiner

var Q = require("q"); // import promises functionality
var Qfs = require("q-io/fs"); // import fs with promises
var Qhttp = require("q-io/http"); // import http with promises

var StripBom = require("strip-bom"); // import bom-stripper needed for ical.js
var Ical = require("ical.js"); // import ical parser

// constants
const data = {
	serverport: 8080,
	dataSource: {
		icsMoodleUrlBase: "http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/",
		preSemesterString: "semester",
		preCourseString: "kurs",
		majors: ["wi", "bank", "tourismus", "iba", "ppm"], // holds majors whose schedules are to be fetched
		semesters: 6, // how many semester are to be crawled per major and majors
		courses: ["a", "b", "c", ""] // courses in a given major, e.g. WI13a, WI13b etc.
	},
	destinationDir: "courseData"
};

// ** download a file from a given URL and save it on disk
var downloadFromUrl = function(fileUrl, destinationDir, fileName) {
	return Qhttp.request(fileUrl)
		.then(function(htmlResponse) {
			return htmlResponse.body.read();
		})
		.then(function(content) {
			content = StripBom(content.toString()); //Stripping BOM from file, so Ical.js can parse correctly later
			if (!content.startsWith("<script type")) {
				var filePath = Path.join(destinationDir, fileName);
				return Qfs.write(filePath, content).then(function() {
					return Q.resolve(filePath);
				}, function() {
					return Q.reject("Could not write file.");
				});
			} else {
				return Q.reject("Found response is not an ICS-File.");
			}
		});
};

// ** parse a given ICS file into the database
var parseIcsIntoDatabase = function(filePath) {
	console.log("Reading ICS-file:" + filePath + ".");

	Qfs.read(filePath)
		.then(function(fileContent) {
			var icalComp = Ical.Component(Ical.parse(fileContent)); // parse ical and instantiate ical component
			var vevent = icalComp.getFirstSubcomponent("vevent"); // get the component"s first appointment
			var event = new Ical.Event(vevent); // instantiate the event
			var summary = event.summary; // get the event"s summary
			var description = event.description; // get the event"s description
			var location = event.location; // get the event"s location

			console.log("------------");
			console.log("SUMMARY:" + summary);
			console.log("DESCRIPTION:" + description);
			console.log("LOCATION:" + location);
			console.log("------------");
		});
};

// Define what happens if someone requests anything from the server
Express.get("/", function(request, response) {
	// Fill array with courses (Studiengänge) from text file
	console.log("Start processing course data");

	for (var major of data.dataSource.majors) {
		for (var semester = 1; semester <= data.dataSource.semesters; semester++) {
			for (var course of data.dataSource.courses) {
				// Download ICS files: Pattern = {baseURL}+{major}+"/semester"+{integer}+"/kurs"+{courseLetter}
				var downloadUrl = Urljoin(data.dataSource.icsMoodleUrlBase, major, data.dataSource.preSemesterString + semester, data.dataSource.preCourseString + course);
				console.log("Trying to download: " + downloadUrl);
				downloadFromUrl(downloadUrl, data.destinationDir, major + semester + course + ".ics")
					.then(parseIcsIntoDatabase);
			}
		}
	}

	console.log("Finished processing course data");
	response.end();
});

//  Start the server
Express.listen(data.serverport, function() {
	console.log("Server erzeugt. Erreichbar unter http://localhost:%d", data.serverport);
});