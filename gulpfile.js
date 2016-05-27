'use strict';
var gulp = require('gulp');

// utilities
var gulpServer = require('gulp-develop-server');
var gutil = require('gulp-util');

// source files, first file is the app entry
const serverFiles = [
	'src/backend.js',
	'src/databaseUpdater.js'
];

// gulp tasks
gulp.task('serve', () => {
	if (gutil.env.type === 'prod') {
		options.env = {
			NODE_ENV: 'production'
		};
	}

	gulpServer.listen({
		path: serverFiles[0]
	});
	gulp.watch(serverFiles, gulpServer.restart);
});

gulp.task('default', ['serve']);