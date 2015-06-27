'use strict';

var debug = require('debug')('koa-preprocessor');
var fs = require('co-fs');
var globule = require('globule');
var gulp = require('gulp');
var path = require('path');
var plumber = require('gulp-plumber');
var tap = require('gulp-tap');

/**
 * @type {Object<string, {Promise|File}>}
 */
var caches = {};

/**
 * @param {string} relPath
 * @param {Object} globuleOptions
 * @param {Function} task
 * @return {Promise}
 */
function transform(relPath, globuleOptions, task) {
  if (caches[relPath] instanceof Promise) {
    debug('[%s] from cache', relPath);
    return caches[relPath];
  }

  var promise = new Promise(function(resolve, reject) {
    var stream = gulp.src(relPath, globuleOptions)
      .pipe(plumber(function(error) {
        reject(error);
      }));

    task(stream);

    stream.pipe(tap(function(file) {
      debug('[%s] resolve', relPath);
      resolve(file);
      caches[relPath] = file;
    }));
  });

  caches[relPath] = promise;
  return promise;
}

function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function preprocessor(settings) {
  var globuleOptions = {
    cwd: settings.cwd,
  };

  debug('watch %s', settings.src, globuleOptions);
  var watcher = gulp.watch(settings.src, globuleOptions);

  watcher.on('change', function (event) {
    var relPath = '.' + path.sep + path.relative(globuleOptions.cwd, event.path);

    if (event.type === 'deleted') {
      debug('[%s] deleted');
      caches[relPath] = null;
    } else if (event.type === 'changed') {
      transform(relPath, globuleOptions, settings.task);
    }
  });

  return function *(next) {
    var srcPath = this.path;

    if (settings.inExt) {
      if (endsWith(srcPath, '.' + settings.inExt)) {
        srcPath = srcPath.slice(0, -settings.inExt.length) + settings.srcExt;
      } else {
        yield *next;
        return;
      }
    }

    var relPath = '.' + srcPath;

    var file = caches[relPath];

    if (!file) {
      var isMatch = globule.isMatch(settings.src, relPath);

      if (isMatch) {
        var cwd = settings.cwd || process.cwd();

        if (yield fs.exists(cwd + srcPath)) {
          debug('[%s] transform', relPath);
          file = yield transform(relPath, globuleOptions, settings.task).catch(function(error) {
            caches[relPath] = null;
            throw error;
          });
        }
      } else {
        debug('[%s] no matched, src: %s', relPath, settings.src);
      }
    } else {
      debug('[%s] from cache', relPath);
    }

    if (file) {
      this.set('Last-Modified', file.stat.mtime.toUTCString());
      this.set('Content-Length', file.stat.size);

      this.status = 200; // correct calc fresh

      if (this.fresh) {
        this.status = 304;
        return;
      }

      this.body = file.contents.toString();

      debug('[%s] send', relPath);
    } else {
      yield *next;
    }
  };
}

module.exports = preprocessor;
