var should = require('should');
var http = require('http');

var Wemo = require('../index');

describe('Wemo', function () {

  it('must expose a public constructor', function() {
    Wemo.should.be.a.Function();
  });

  it('must listen on a port', function (done) {
    var wemo = new Wemo();
    var address = wemo.getCallbackURL();
    http.get(address, function (res) {
      res.statusCode.should.equal(404);
      done();
    });
  });

});
