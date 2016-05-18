'use strict';

var gulp = require('gulp');
var gulpServer = require('gulp-develop-server');
var gutil = require('gulp-util');

var serverFiles = [
	'src/backend.js',
	'src/databaseUpdater.js'
];

var options = {
	path: serverFiles[0]
};

gulp.task('serve', function() {
	if (gutil.env.type === 'prod') {
		options.env = {
			NODE_ENV: 'production'
		};
	}

	gulpServer.listen(options);
	gulp.watch(serverFiles, [gulpServer.restart]);
});

gulp.task('default', ['serve']);