var express = require('express');	// node.js: declare webserver
var app = express(); 					// instantiate webserver
var http = require('http');
var port = 8080;

// Dependencies for downloadFromUrl
var fs = require('fs');
var url = require('url');
var http = require('http');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;

// download something from a given url and save it on disk
var downloadFromUrl = function(url, destinationDir) {
	var DOWNLOAD_DIR = destinationDir;

	// Function to download file using HTTP.get
	var download_file_httpget = function(url) {
	var options = {
		host: url.parse(url).host,
		port: 80,
		path: url.parse(url).pathname
	};

	var file_name = url.parse(url).pathname.split('/').pop();
	var file = fs.createWriteStream(DOWNLOAD_DIR + file_name);

	http.get(options, function(res) {
		res.on('data', function(data) {
				file.write(data);
			}).on('end', function() {
				file.end();
				console.log(file_name + ' downloaded to ' + DOWNLOAD_DIR);
			});
		});
	};
};


// Define what happens if someone requests something from the server
app.get('/', function(req, res) {
	// res.send("Lese die Studiengänge ein (vgl. Console)"); // DEBUG

	// Fill array with courses (Studiengänge) from text file
	var majorNames = []				// holds majors whose schedules are to be fetched
	var fs = require('fs'); 				// filesystem
  	var filename = './courseData/majors.txt';
	
	var majorNames = fs.readFileSync(filename, 'utf8').split(";");
	console.log('Faecher: ' + majorNames);

	var courses = ["a", "b", "c"];	// courses in a given major, e.g. WI13a, WI13b etc.
	var numberOfSemesters = 6;	// how many semester are to be crawled per major and majors
	var icsMoodleUrlBase = 'http://moodle.hwr-berlin.de/fb2-stundenplan/download.php?doctype=.ics&url=./fb2-stundenplaene/';
	var icsUrls = [];
		
	for (i in majorNames) {
		for (var sem=1; sem<numberOfSemesters+1; sem++) {
			for (j in courses) {
				// Append respective ICS-URL. Pattern: {baseURL}+{major}+"/semester"+{integer}+"/kurs"+{courseLetter}
				icsUrls.push(icsMoodleUrlBase + majorNames[i] + '/semester' + sem + '/kurs' + courses[j]);
			}
		}
	}
	
	console.log("URLS: " + icsUrls); // DEBUG	
	console.log(''); // DEBUG	
	
	// downloadFromUrl('http://www.hacksparrow.com/using-node-js-to-download-files.html', './courseData/');
	downloadFromUrl(icsUrls[87], './courseData/');	
});

//  Start the server
app.listen(port, function(){
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', port);
});