var gulp = require('gulp'),
	server = require('gulp-develop-server');

gulp.task('serve', function() {
	server.listen({
		path: './backend.js'
	});
	gulp.watch(['./backend.js'], server.restart);
});

gulp.task('default', ['serve']);