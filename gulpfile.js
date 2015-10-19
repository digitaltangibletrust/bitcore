/**
 * @file gulpfile.js
 *
 * Defines tasks that can be run on gulp.
 *
 * Summary: <ul>
 * <li> `test` - runs all the tests on node and the browser (mocha and karma)
 * <ul>
 * <li> `test:node`
 * <li> `test:node:nofail` - internally used for watching (due to bug on gulp-mocha)
 * <li> `test:browser`
 * </ul>`
 * <li> `watch:test` - watch for file changes and run tests
 * <ul>
 * <li> `watch:test:node`
 * <li> `watch:test:browser`
 * </ul>`
 * <li> `browser` - generate files needed for browser (browserify)
 * <ul>
 * <li> `browser:uncompressed` - build uncomprssed browser bundle (`bitcore-*.js`)
 * <li> `browser:compressed` - build compressed browser bundle (`bitcore-*.min.js`)
 * <li> `browser:maketests` - build `tests.js`, needed for testing without karma
 * </ul>`
 * <li> `lint` - run `jshint`
 * <li> `coverage` - run `istanbul` with mocha to generate a report of test coverage
 * <li> `coveralls` - updates coveralls info
 * <li> `release` - automates release process (only for maintainers)
 * </ul>
 */
'use strict';

var gulp = require('gulp');

var rename = require('gulp-rename');
var runsequence = require('run-sequence');
runsequence.use(gulp);
var shell = require('gulp-shell');
var uglify = require('gulp-uglify');

var name = false;
var isSubmodule = name ? true : false;
var fullname = name ? 'bitcore-' + name : 'bitcore';

var buildPath = './node_modules/';
var buildBinPath = buildPath + '.bin/';

/**
 * file generation
 */

var browserifyCommand;

if (isSubmodule) {
  browserifyCommand = buildBinPath + 'browserify --require ./index.js:' + fullname + ' --external bitcore -o ' + fullname + '.js';
} else {
  browserifyCommand = buildBinPath + 'browserify --require ./index.js:bitcore -o bitcore.js';
}

gulp.task('browser:uncompressed', shell.task([
      browserifyCommand
    ]));

gulp.task('browser:compressed', ['browser:uncompressed'], function () {
  return gulp.src(fullname + '.js')
    .pipe(uglify({
      mangle: true,
      compress: true
    }))
    .pipe(rename(fullname + '.min.js'))
    .pipe(gulp.dest('.'))
    .on('error', console.log.bind(console));
});

gulp.task('browser', function (callback) {
  runsequence(['browser:compressed'], callback);
});
