var express = require('express');	// node.js: declare webserver
var app = express(); 					// instantiate webserver
var http = require('http');
var port = 8080;

var webdata;								// TODO Hält Inhalt der ICS-Files


app.get('/', function(req, res) {
	// res.send("Lese die Studiengänge ein (vgl. Console)"); // DEBUG

	// Fill array with courses (Studiengänge) from text file
	var majorNames = []				// holds majors whose schedules are to be fetched
	var fs = require('fs'); 				// filesystem
  	var filename = './courseData/majors.txt';
	
	fs.readFile(filename, 'utf8', function(err, data) {
	  	if (err) throw err;
	  	majorNames = data.toString().split(";");
		console.log('Faecher: ' + majorNames); // DEBUG
	});
		
	
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
	
	
	
	// Function to download file using wget
	var download_file_wget = function(file_url) {
		
		var DOWNLOAD_DIR = './courseData/'
		
		var file_name = url.parse(file_url).pathname.split('/').pop(); // extract the file name
		var wget = 'wget -P ' + DOWNLOAD_DIR + ' ' + file_url; // compose the wget command
		
		// excute wget using child_process' exec function
		var child = exec(wget, function(err, stdout, stderr) {
			if (err) throw err;
			else console.log(file_name + ' downloaded to ' + DOWNLOAD_DIR);
		});
	};
	
	// download_file_wget(icsUrls[87]);
	// download_file_wget('http://philippkoch.com/img/index/ph_bruecke.jpg');
	
});


app.listen(port, function(){
	console.log('Server erzeugt. Erreichbar unter http://localhost:%d', port);
});


/*	
	http.get("http://www.philippkoch.com", function(response) {
		console.log(response.statusCode);
		webdata = null;
		response.on('data', function(chunk) {
			console.log('Body:' + chunk);
			webdata += chunk;
		})

	});
*/