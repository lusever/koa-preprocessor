'use strict';

var debug = require('debug')('koa-preprocessor');
var fs = require('co-fs');
var globule = require('globule');
var gulp = require('gulp');
var mime = require('mime-types');
var path = require('path');
var tap = require('gulp-tap');

/**
 * @type {Object<string, {Promise|File}>}
 */
var caches = {};

/**
 * @param {string} relPath
 * @param {Object} globuleOptions
 * @param {Array} tasks
 * @return {Promise}
 */
function transform(relPath, globuleOptions, tasks) {
  if (caches[relPath] instanceof Promise) {
    debug('%s from cache', relPath)
    return caches[relPath];
  }

  var promise = new Promise(function(resolve, reject) {
    var stream = gulp.src(relPath, globuleOptions);

    tasks.forEach(function(task) {
      stream.pipe(task);
    });

    stream
      .pipe(tap(function(file) {
        resolve(file);
        caches[relPath] = file;
      }));

    stream.on('error', function(err) {
      reject(err);
    });

  });

  caches[relPath] = promise;
  return promise;
}

function preprocessor(options) {
  var globuleOptions = {
    cwd: options.cwd,
  };

  var tasks = Array.isArray(options.pipe) ? options.pipe : [options.pipe];

  debug('watch %s', options.src, globuleOptions);
  var watcher = gulp.watch(options.src, globuleOptions);

  watcher.on('change', function (event) {
    var relPath = '.' + path.sep + path.relative(globuleOptions.cwd, event.path);

    if (event.type === 'deleted') {
      caches[relPath] = null;
    } else if (event.type === 'changed') {
      transform(relPath, globuleOptions, tasks);
    }
  });

  return function *(next) {
    var srcPath = this.path;

    if (options.inExt && srcPath.endsWith('.' + options.inExt)) {
      srcPath = srcPath.slice(0, - options.inExt.length) + options.srcExt;
    }

    var relPath = '.' + srcPath;

    var file = caches[relPath];

    if (!file) {
      var isMatch = globule.isMatch(options.src, relPath, globuleOptions);

      if (isMatch) {
        var cwd = options.cwd || process.cwd();

        if (yield fs.exists(cwd + srcPath)) {
          debug('transform %s', cwd + srcPath);
          file = yield transform(relPath, globuleOptions, tasks);
        }
      }
    }

    if (file) {
      this.set('Last-Modified', file.stat.mtime.toUTCString());
      this.set('Content-Length', file.stat.size);

      this.status = 200; // correct calc fresh

      if (this.fresh) {
        this.status = 304;
        return;
      }

      this.type = mime.lookup(file.path) || 'application/octet-stream';
      this.body = file.contents.toString();
    } else {
      yield *next;
    }
  };
}

module.exports = preprocessor;
