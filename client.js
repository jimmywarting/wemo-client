var util = require('util');
var http = require('http');
var xml2js = require('xml2js');
var entities = require('entities');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('wemo-client');

function mapCapabilities(capabilityIds, capabilityValues) {
  var ids = capabilityIds.split(',');
  var values = capabilityValues.split(',');
  var result = {};
  ids.forEach(function(val, index) {
    result[val] = values[index];
  });
  return result;
}

var WemoClient = module.exports = function(config) {
  EventEmitter.call(this);
  this.host = config.host;
  this.port = config.port;
  this.deviceType = config.deviceType;
  this.UDN = config.UDN;
  this.subscriptions = {};
  this.callbackURL = config.callbackURL;
  this.device = config;

  // Create map of services
  config.serviceList.service.forEach(function(service) {
    this[service.serviceType] = {
      serviceId: service.serviceId,
      controlURL: service.controlURL,
      eventSubURL: service.eventSubURL
    };
  }, this.services = {});

  // Transparently subscribe to serviceType events
  // TODO: Unsubscribe from ServiceType when all listeners have been removed.
  this.on('newListener', this._onListenerAdded);
};

util.inherits(WemoClient, EventEmitter);

WemoClient.EventServices = {
  insightParams: 'urn:Belkin:service:insight:1',
  statusChange: 'urn:Belkin:service:bridge:1',
  attributeList: 'urn:Belkin:service:basicevent:1',
  binaryState: 'urn:Belkin:service:basicevent:1'
};

WemoClient.request = function(options, data, cb) {
  if (!cb && typeof data === 'function') {
    cb = data;
    data = null;
  }

  var req = http.request(options, function(res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      if (res.statusCode === 200) {
        xml2js.parseString(body, { explicitArray: false }, cb);
      } else {
        cb(new Error('HTTP ' + res.statusCode + ': ' + body));
      }
    });
    res.on('error', function(err) {
      debug('Error on http.request.res:', err);
      cb(err);
    });
  });
  req.on('error', function(err) {
    debug('Error on http.request.req:', err);
    cb(err);
  });
  if (data) {
    req.write(data);
  }
  req.end();
};

WemoClient.prototype.soapAction = function(serviceType, action, body, cb) {
  cb = cb || function() {};

  var payload = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>';
  payload += util.format('<u:%s xmlns:u="%s">%s</u:%s>', action, serviceType, body, action);
  payload += '</s:Body></s:Envelope>';

  var options = {
    host: this.host,
    port: this.port,
    path: this.services[serviceType].controlURL,
    method: 'POST',
    headers: {
      'SOAPACTION': '"' + serviceType + '#' + action + '"',
      'Content-Type': 'text/xml; charset="utf-8"'
    }
  };

  WemoClient.request(options, payload, function(err, response) {
    if (err) return cb(err);
    debug('%s Response: ', action, response);
    cb(null, response && response['s:Envelope']['s:Body']['u:' + action + 'Response']);
  });
};

WemoClient.prototype.getEndDevices = function(cb) {
  var parseDeviceInfo = function(data) {
    var device = {};

    if (data.GroupID) {
      // treat device group as it was a single device
      device.friendlyName = data.GroupName[0];
      device.deviceId = data.GroupID[0];
      device.capabilities = mapCapabilities(
        data.GroupCapabilityIDs[0],
        data.GroupCapabilityValues[0]
      );
    } else {
      // single device
      device.friendlyName = data.FriendlyName[0];
      device.deviceId = data.DeviceID[0];
      device.capabilities = mapCapabilities(
        data.CapabilityIDs[0],
        data.CurrentState[0]
      );
    }

    // set device type
    if (device.capabilities.hasOwnProperty('10008')) {
      device.deviceType = 'dimmableLight';
    }
    if (device.capabilities.hasOwnProperty('10300')) {
      device.deviceType = 'colorLight';
    }

    return device;
  };

  var parseResponse = function(err, data) {
    if (err) return cb(err);
    debug('endDevices raw data', data);
    var endDevices = [];
    xml2js.parseString(data.DeviceLists, function(err, result) {
      if (err) return cb(err);
      var deviceInfos = result.DeviceLists.DeviceList[0].DeviceInfos[0].DeviceInfo;
      if (deviceInfos) {
        Array.prototype.push.apply(endDevices, deviceInfos.map(parseDeviceInfo));
      }
      if (result.DeviceLists.DeviceList[0].GroupInfos) {
        var groupInfos = result.DeviceLists.DeviceList[0].GroupInfos[0].GroupInfo;
        Array.prototype.push.apply(endDevices, groupInfos.map(parseDeviceInfo));
      }
      cb(null, endDevices);
    });
  };

  var body = '<DevUDN>%s</DevUDN><ReqListType>PAIRED_LIST</ReqListType>';
  this.soapAction('urn:Belkin:service:bridge:1', 'GetEndDevices', util.format(body, this.UDN), parseResponse);
};

WemoClient.prototype.setDeviceStatus = function(deviceId, capability, value, cb) {
  var isGroupAction = (deviceId.length === 10) ? 'YES' : 'NO';
  var body = [
    '<DeviceStatusList>',
    '&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&lt;DeviceStatus&gt;&lt;IsGroupAction&gt;%s&lt;/IsGroupAction&gt;&lt;DeviceID available=&quot;YES&quot;&gt;%s&lt;/DeviceID&gt;&lt;CapabilityID&gt;%s&lt;/CapabilityID&gt;&lt;CapabilityValue&gt;%s&lt;/CapabilityValue&gt;&lt;/DeviceStatus&gt;',
    '</DeviceStatusList>'
  ].join('\n');
  this.soapAction('urn:Belkin:service:bridge:1', 'SetDeviceStatus', util.format(body, isGroupAction, deviceId, capability, value), cb);
};

WemoClient.prototype.getDeviceStatus = function(deviceId, cb) {
  var parseResponse = function(err, data) {
    if (err) return cb(err);
    xml2js.parseString(data.DeviceStatusList, { explicitArray: false }, function(err, result) {
      if (err) return cb(err);
      var deviceStatus = result['DeviceStatusList']['DeviceStatus'];
      var capabilities = mapCapabilities(deviceStatus.CapabilityID, deviceStatus.CapabilityValue);
      cb(null, capabilities);
    });
  };
  var body = '<DeviceIDs>%s</DeviceIDs>';
  this.soapAction('urn:Belkin:service:bridge:1', 'GetDeviceStatus', util.format(body, deviceId), parseResponse);
};

WemoClient.prototype.setLightColor = function(deviceId, red, green, blue, cb) {
  var color = WemoClient.rgb2xy(red, green, blue);
  this.setDeviceStatus(deviceId, 10300, color.join(':') + ':0', cb);
};

WemoClient.prototype.setBinaryState = function(value, cb) {
  var body = '<BinaryState>%s</BinaryState>';
  this.soapAction('urn:Belkin:service:basicevent:1', 'SetBinaryState', util.format(body, value), cb);
};

WemoClient.prototype.getBinaryState = function(cb) {
  this.soapAction('urn:Belkin:service:basicevent:1', 'GetBinaryState', null, function(err, data) {
    if (err) return cb(err);
    cb(null, data.BinaryState);
  });
};

WemoClient.prototype.getAttributes = function(cb) {
  this.soapAction('urn:Belkin:service:deviceevent:1', 'GetAttributes', null, function(err, data) {
    if (err) return cb(err);
    var xml = '<attributeList>' + entities.decodeXML(data.attributeList) + '</attributeList>';
    xml2js.parseString(xml, { explicitArray: false }, function(err, result) {
      if (err) return cb(err);
      var attributes = {};
      for (var key in result.attributeList.attribute) {
        var attribute = result.attributeList.attribute[key];
        attributes[attribute.name] = attribute.value;
      }
      cb(null, attributes);
    });
  });
};

WemoClient.prototype._onListenerAdded = function(eventName) {
  var serviceType = WemoClient.EventServices[eventName];
  if (serviceType && this.services[serviceType]) {
    this._subscribe(serviceType);
  }
};

WemoClient.prototype._subscribe = function(serviceType) {

  if (!this.services[serviceType]) {
    throw new Error('Service ' + serviceType + ' not supported by ' + this.UDN);
  }
  if (!this.callbackURL) {
    debug('no callback URL - returning');
    return;
  }
  if (this.subscriptions[serviceType] && this.subscriptions[serviceType] === 'PENDING') {
    debug('subscription still pending');
    return;
  }

  var options = {
    host: this.host,
    port: this.port,
    path: this.services[serviceType].eventSubURL,
    method: 'SUBSCRIBE',
    headers: {
      TIMEOUT: 'Second-130'
    }
  };

  if (!this.subscriptions[serviceType]) {
    // Initial subscription
    this.subscriptions[serviceType] = 'PENDING';
    debug('Initial subscription - Device: %s, Service: %s', this.UDN, serviceType);
    options.headers.CALLBACK = '<' + this.callbackURL + '/' + this.UDN + '>';
    options.headers.NT = 'upnp:event';
  } else {
    // Subscription renewal
    debug('Renewing subscription - Device: %s, Service: %s', this.UDN, serviceType);
    options.headers.SID = this.subscriptions[serviceType];
  }

  var self = this;

  var req = http.request(options, function(res) {
    if (res.headers.sid) {
      this.subscriptions[serviceType] = res.headers.sid;
      setTimeout(this._subscribe.bind(this), 120 * 1000, serviceType);
    }
  }.bind(this));

  req.on('error', function(err) {
    // We can't pass back errors to the calling module so we'll do what we can to try
    // and gracefully recover from HTTP errors.
    // ECONNREFUSED suggests that the port number may have changed
    // EHOSTUNREACH suggests the device has gone (switched off maybe)
    // ETIMEDOUT    seems to be recoverable - just lost it for a bit, we'll retry.
    var timeout = 5; // seconds before we retry
    debug('HTTP Error (%s) occurred (re)subscribing to Wemo Device (%s - %s:%s), retrying.',
      err.code, self.device.friendlyName, self.device.host, self.device.port, self.UDN);
    if (err.code === 'ECONNREFUSED') { // try the alternate port that wemo tends to use. See #21
      (self.port === '49154') ? self.port = '49153' : self.port = '49154' ;
      debug('Trying port: %s', self.port);
      timeout = 1; // may as well try the new port sooner than later
    }
    this.subscriptions[serviceType] = null; // reset expectations about the presence of this device
    setTimeout(this._subscribe.bind(this), timeout * 1000, serviceType);
  }.bind(this));

  req.end();
};

WemoClient.prototype.handleCallback = function(body) {
  var self = this;
  var handler = {
    BinaryState: function(data) {
      self.emit('binaryState', data.substring(0, 1));
    },
    StatusChange: function(data) {
      xml2js.parseString(data, { explicitArray: false }, function(err, xml) {
        if (!err) {
          self.emit('statusChange',
            xml.StateEvent.DeviceID._,
            xml.StateEvent.CapabilityId,
            xml.StateEvent.Value
          );
        }
      });
    },
    InsightParams: function(data) {
      var params = data.split('|');
      var insightParams = {
        ONSince: params[1],
        OnFor: params[2],
        TodayONTime: params[3],
        TodayConsumed: params[8]  // power consumer today (mW per minute)
      };
      self.emit('insightParams',
        params[0], // binary state
        params[7], // instant power
        insightParams
      );
    },
    attributeList: function(data) {
      var xml = '<attributeList>' + entities.decodeXML(data) + '</attributeList>';
      xml2js.parseString(xml, { explicitArray: true }, function(err, result) {
        if (!err) {
          // In order to keep the existing event signature this
          // triggers an event for every attribute changed.
          result.attributeList.attribute.forEach(function(attribute) {
            self.emit('attributeList',
              attribute.name[0],
              attribute.value[0],
              attribute.prevalue[0],
              attribute.ts[0]
            );
          });
        }
      });
    }
  };

  xml2js.parseString(body, { explicitArray: false }, function(err, xml) {
    if (err) throw err;
    for (var prop in xml['e:propertyset']['e:property']) {
      if (handler.hasOwnProperty(prop)) {
        handler[prop](xml['e:propertyset']['e:property'][prop]);
      } else {
        debug('Unhandled Event: %s', prop);
      }
    }
  });
};

WemoClient.rgb2xy = function(r, g, b) {
  // Based on: https://github.com/aleroddepaz/pyhue/blob/master/src/pyhue.py
  var X = (0.545053 * r) + (0.357580 * g) + (0.180423 * b);
  var Y = (0.212671 * r) + (0.715160 * g) + (0.072169 * b);
  var Z = (0.019334 * r) + (0.119193 * g) + (0.950227 * b);

  var x = X / (X + Y + Z);
  var y = Y / (X + Y + Z);

  return [
    Math.round(x * 65535),
    Math.round(y * 65535)
  ];
};
