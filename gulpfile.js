var gulp = require('gulp');
var server = require('gulp-develop-server');
var browserSync = require('browser-sync');

var serverFiles = [
	'./backend.js',
	'./updater.js'
];

var options = {
	server: {
		path: './backend.js',
		execArgv: ['--harmony']
	},
	bs: {
		proxy: 'http://localhost:8080'
	}
};

gulp.task('server:restart', function() {
	server.restart(function(error) {
		if (!error) browserSync.reload();
	});
});

gulp.task('serve', function() {
	server.listen(options.server, function(error) {
		if (!error) browserSync(options.bs);
	});

	gulp.watch(serverFiles, ['server:restart']);
});

gulp.task('default', ['serve']);