var express = require('express');	// node.js: declare webserver
var app = express(); 					// instantiate webserver
var http = require('http');
var port = 8080;

// Dependencies for downloadFromUrl
var fs = require('fs');
var url = require('url');
var http = require('http');

// download something from a given url and save it on disk
var downloadFromUrl = function(fileUrl, destinationDir, file_name) {
	var DOWNLOAD_DIR = destinationDir;	
	var fileChunks = [];
	
	http.get(fileUrl, function(res) {
		res.on('data', function(data) {			 						
			fileChunks.push(data);
		}).on('end', function() {
			var completeFile = fileChunks.join(''); // put together all the chunks in one string
			if (!completeFile.toString().startsWith('<script type="text/javascript">')) {
				var file = fs.createWriteStream(DOWNLOAD_DIR + file_name);
				file.write(completeFile);
			}			
		});
	});
};	

	
// Define what happens if someone requests something from the server
app.get('/', function(req, res) {
	// res.send("Lese die Studiengänge ein (vgl. Console)"); // DEBUG

	// Fill array with courses (Studiengänge) from text file
	var majorNames = []				// holds majors whose schedules are to be fetched
	var fs = require('fs'); 				// filesystem
  	var filename = './courseData/_majors.txt';
	
	var majorNames = fs.readFileSync(filename, 'utf8').split(";");
	console.log('Faecher: ' + majorNames);

	var courses = ["a", "b", "c"];	// courses in a given major, e.g. WI13a, WI13b etc.
	var numberOfSemesters = 6;	// how many semester are to be crawled per major and majors
	var icsMoodleUrlBase = 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/';
			
	for (i in majorNames) {
		for (var sem=1; sem<numberOfSemesters+1; sem++) {
			for (j in courses) {
				// Download ICS files: Pattern = {baseURL}+{major}+"/semester"+{integer}+"/kurs"+{courseLetter}
				downloadFromUrl(icsMoodleUrlBase + majorNames[i] + '/semester' + sem + '/kurs' + courses[j], "./courseData/", majorNames[i]+sem+courses[j]+".ics");				
			}
		}
	}	
	
});

//  Start the server
app.listen(port, function(){
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', port);
});