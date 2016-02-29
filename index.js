var SSDPClient = require('node-ssdp').Client;
var url = require('url');
var http = require('http');
var os = require('os');
var debug = require('debug')('wemo-client');

var WemoClient = require('./client');

var Wemo = module.exports = function() {
  this._clients = {};
  this._listen();
  this._ssdpClient = new SSDPClient();
};

Wemo.DEVICE_TYPE = {
  Bridge: 'urn:Belkin:device:bridge:1',
  Switch: 'urn:Belkin:device:controllee:1',
  Motion: 'urn:Belkin:device:sensor:1',
  Maker: 'urn:Belkin:device:Maker:1',
  Insight: 'urn:Belkin:device:insight:1',
  LightSwitch: 'urn:Belkin:device:lightswitch:1'
};

Wemo.prototype.load = function(setupUrl, cb) {
  var self = this;
  var location = url.parse(setupUrl);

  WemoClient.request({
    host: location.hostname,
    port: location.port,
    path: location.path,
    method: 'GET'
  }, function(err, json) {
    if (!err && json) {
      var device = json.root.device;
      device.host = location.hostname;
      device.port = location.port;
      device.callbackURL = self.getCallbackURL();

      // Return only matching devices and return them only once!
      if (!self._clients[device.UDN] && device.deviceType.match(/^urn:Belkin:device/)) {
        debug('Found device: %j', json);
        if (cb) {
          cb.call(self, device);
        }
      }
    }
  });
};

// DEPRECATED: cb is replaced with event in 0.7
Wemo.prototype.discover = function(cb) {
  var self = this;
  var handleResponse = function(msg, statusCode, rinfo) {
    self.load(msg.LOCATION, cb);
  };

  this._ssdpClient.removeAllListeners('response');
  this._ssdpClient.on('response', handleResponse);
  this._ssdpClient.search('urn:Belkin:service:basicevent:1');
};

Wemo.prototype._listen = function() {
  this._server = http.createServer(this._handleRequest.bind(this));
  this._server.listen(0, function(err) {
    if (err) {
      throw err;
    }
  });
};

Wemo.prototype._handleRequest = function(req, res) {
  var body = '';
  var udn = req.url.substring(1);

  if ((req.method == 'NOTIFY') && this._clients[udn]) {
    req.on('data', function(chunk) {
      body += chunk.toString();
    });
    req.on('end', function() {
      debug('Incoming Request for %s: %s', udn, body);
      this._clients[udn].handleCallback(body);
      res.writeHead(204);
      res.end();
    }.bind(this));
  } else {
    debug('Received request for unknown device: %s', udn);
    res.writeHead(404);
    res.end();
  }
};

Wemo.prototype.getCallbackURL = function() {
  var getLocalInterfaceAddress = function() {
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
      for (var k2 in interfaces[k]) {
        var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(address.address);
        }
      }
    }
    return addresses.shift();
  };

  if (!this._callbackURL) {
    var port = this._server.address().port;
    var host = getLocalInterfaceAddress();
    this._callbackURL = 'http://' + host + ':' + port;
  }
  return this._callbackURL;
};

// DEPRECATED: Removed in 1.0
Wemo.prototype.client = function(device) {
  if (this._clients[device.UDN]) {
    return this._clients[device.UDN];
  }

  var client = this._clients[device.UDN] = new WemoClient(device);
  return client;
};
