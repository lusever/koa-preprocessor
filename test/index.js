'use strict';

var koa = require('koa');
var preprocessor = require('../lib/koa-preprocessor');
var replace = require('gulp-replace');
var request = require('supertest');

describe('use middleware', function() {
  var app = koa();

  app.use(preprocessor({
    cwd: __dirname,
    src: './**/*.src',
    inExt: 'txt',
    srcExt: 'src',
    task: function(stream) {
      return stream.pipe(replace(/(.|\n)*/, 'processed'));
    },
  }));

  var server = app.listen();

  it('GET anyformat.txt', function(done) {
    request(server)
      .get('/assets/anyformat.txt')
      .expect('Content-Type', /text\/plain/)
      .expect(200, 'processed')
      .end(done);
  });

  it('Not Found anyformat.src', function(done) {
    // no processed for source map
    request(server)
      .get('/assets/anyformat.src')
      .expect(404)
      .end(done);
  });
});
