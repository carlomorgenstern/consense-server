var express = require('express'); 	// node.js: declare webserver
var app = express(); 					// instantiate webserver
var http = require('http');
var port = 8080;
var ical = require('ical.js');			// instantiate ICAL parser
var Q = require('q');					// provide promises to the script execution
var stripBom = require('strip-bom');

// Dependencies for downloadFromUrl
var fs = require('fs');
var url = require('url');
var http = require('http');

// ** download something from a given url and save it on disk
var downloadFromUrl = function(fileUrl, destinationDir, file_name) {
	var fileChunks = [];
	var deferred = Q.defer(); // object to handle promise
	
	http.get(fileUrl, function(res) {
		res.on('data', function(data) {
			fileChunks.push(data);
		}).on('end', function() {
			var completeFile = fileChunks.join(''); // put together all the chunks in one string

			// only write if ics-file actually holds appointment data
			if (!completeFile.toString().startsWith('<script type="text/javascript">')) {
				var file = fs.createWriteStream(destinationDir + file_name);
				file.write(completeFile, "utf8", function(){
					console.log('Successfully downloaded ' + destinationDir + file_name + ".");
					deferred.resolve(destinationDir + file_name); // announce that download has been successful
				});
			} else {
				deferred.reject(); // download not successful
			}		
		});
	});
	
	return deferred.promise;
};


// ** parse a given ICS file into the database
var parseIcsIntoDatabase = function(filePath) {
	console.log('Reading ICS-file:' + filePath + ".");
	var fileContent = stripBom(fs.readFileSync(filePath, 'utf8'));
	var icalData = ICAL.parse(fileContent);
	
	var comp = new ICAL.Component(icalData);				// instantiate ical component
	var vevent = comp.getFirstSubcomponent("vevent");	// get the component's first appointment
	var event = new ICAL.Event(vevent);						// instantiate the event
	var summary = event.summary;								// get the event's summary
	var description = event.description;							// get the event's description
	var location = event.location;									// get the event's location
	
	console.log('------------');
	console.log('SUMMARY:' + summary);
	console.log('DESCRIPTION:' + description);
	console.log('LOCATION:' + location);	
	console.log('------------');
};


// Define what happens if someone requests something from the server
app.get('/', function(req, res) {
	// Fill array with courses (Studiengänge) from text file
	var majorNames = [] 	// holds majors whose schedules are to be fetched
	var fs = require('fs'); 	// filesystem
	var filename = './majors.txt';

	var majorNames = fs.readFileSync(filename, 'utf8').split(";");
	console.log('Start downloading course data:');

	var courses = ["a", "b", "c", ""]; 	// courses in a given major, e.g. WI13a, WI13b etc.
	var numberOfSemesters = 6; 		// how many semester are to be crawled per major and majors
	var icsMoodleUrlBase = 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/';

	for (i in majorNames) {
		for (var sem = 1; sem < numberOfSemesters + 1; sem++) {
			for (j in courses) {
				// Download ICS files: Pattern = {baseURL}+{major}+"/semester"+{integer}+"/kurs"+{courseLetter}
				console.log('Trying to download: ' + majorNames[i] + ", semester #" + sem + ", course " + courses[j] + ".");
				var promise = downloadFromUrl(icsMoodleUrlBase + majorNames[i] + '/semester' + sem + '/kurs' + courses[j], "./courseData/", majorNames[i] + sem + courses[j] + ".ics");
				promise.then(function (filePath) {
					parseIcsIntoDatabase(filePath)} // if download has been sucessfully finished, parse the contents
				);	
			}
		}
	}
	
	res.end();
});

//  Start the server
app.listen(port, function() {
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', port);
});