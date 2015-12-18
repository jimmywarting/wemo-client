var util = require('util');
var http = require('http');
var xml2js = require('xml2js');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('wemo-client');

var WemoClient = module.exports = function(config) {
  EventEmitter.call(this);

  this.host = config.host;
  this.port = config.port;
  this.path = config.path;
  this.deviceType = config.deviceType;
  this.UDN = config.UDN;
  this.subscriptions = {};
  this.callbackURL = config.callbackURL;
  this.device = config;

  // Create map of services
  config.serviceList.service.forEach(function(service) {
    this[service.serviceType[0]] = {
      serviceId: service.serviceId[0],
      controlURL: service.controlURL[0],
      eventSubURL: service.eventSubURL[0]
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
  binaryState:  'urn:Belkin:service:basicevent:1'
};

WemoClient.prototype.soapAction = function(serviceType, action, body, cb) {
  var soapHeader = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>';
  var soapBody = util.format('<u:%s xmlns:u="%s">%s</u:%s>', action, serviceType, body, action);
  var soapFooter = '</s:Body></s:Envelope>';

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

  var req = http.request(options, function(res) {
    var data = '';
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      data += chunk;
    });
    res.on('end', function() {
      if (cb) {
        cb(null, data);
      }
    });
    res.on('error', function(err) {
      if (cb) {
        cb(err);
      }
      console.log(err);
    });
  });
  req.write(soapHeader);
  req.write(soapBody);
  req.write(soapFooter);
  req.end();
};

WemoClient.prototype.getEndDevices = function(cb) {
  var parseDeviceInfo = function(data) {
    var device = {};

    if (data.GroupInfo) {
      // treat device group as single device
      device.friendlyName = data.GroupInfo[0].GroupName[0];
      device.deviceId = data.GroupInfo[0].GroupID[0];
      device.currentState = data.GroupInfo[0].GroupCapabilityValues[0];
      device.capabilities = data.GroupInfo[0].GroupCapabilityIDs[0];
    } else {
      // single device
      device.friendlyName = data.FriendlyName[0];
      device.deviceId = data.DeviceID[0];
      device.currentState = data.CurrentState[0];
      device.capabilities = data.CapabilityIDs[0];
    }

    // process device state
    device.currentState = device.currentState.split(',');
    device.capabilities = device.capabilities.split(',');
    device.internalState = {};
    for (var i = 0; i < device.capabilities.length; i++) {
      device.internalState[device.capabilities[i]] = device.currentState[i];
    }

    // set device type
    if (device.capabilities.indexOf('10008') !== -1) {
      device.deviceType = 'dimmableLight';
    }
    if (device.capabilities.indexOf('10300') !== -1) {
      device.deviceType = 'colorLight';
    }

    return device;
  };

  var parseResponse = function(err, data) {
    if (err) return cb(err);
    debug('Response to getEndDevices', data);
    var endDevices = [];
    xml2js.parseString(data, function(err, result) {
      if (!err) {
        var list = result['s:Envelope']['s:Body'][0]['u:GetEndDevicesResponse'][0].DeviceLists[0];
        xml2js.parseString(list, function(err, result2) {
          if (!err) {
            var deviceInfos = result2.DeviceLists.DeviceList[0].DeviceInfos[0].DeviceInfo;
            if (deviceInfos) {
              Array.prototype.push.apply(endDevices, deviceInfos.map(parseDeviceInfo));
            }
            var groupInfos = result2.DeviceLists.DeviceList[0].GroupInfos;
            if (groupInfos) {
              Array.prototype.push.apply(endDevices, groupInfos.map(parseDeviceInfo));
            }
          } else {
            console.log(err, data);
          }
        });
        cb(null, endDevices);
      } else {
        cb(err);
      }
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

WemoClient.prototype.setLightColor = function(deviceId, red, green, blue) {
  var color = WemoClient.rgb2xy(red, green, blue);
  this.setDeviceStatus(deviceId, 10300, color.join(':') + ':0');
};

WemoClient.prototype.setBinaryState = function(value, cb) {
  var body = '<BinaryState>%s</BinaryState>';
  this.soapAction('urn:Belkin:service:basicevent:1', 'SetBinaryState', util.format(body, value), cb);
};

WemoClient.prototype._onListenerAdded = function(eventName) {
  var serviceType = WemoClient.EventServices[eventName];
  if (serviceType && this.services[serviceType]) {
    this.subscribe(serviceType);
  }
};

WemoClient.prototype.subscribe = function(serviceType) {
  if (!this.services[serviceType]) {
    throw new Error('Service ' + serviceType + ' not supported by ' + this.UDN);
  }
  if (!this.callbackURL) {
    throw new Error('No callbackURL given!');
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
    debug('Initial subscription - Device: %s, Service: %s', this.UDN, serviceType);
    options.headers.CALLBACK = '<' + this.callbackURL + '/' + this.UDN + '>';
    options.headers.NT = 'upnp:event';
  } else {
    // Subscription renewal
    debug('Renewing subscription - Device: %s, Service: %s', this.UDN, serviceType);
    options.headers.SID = this.subscriptions[serviceType];
  }

  var req = http.request(options, function(res) {
    if (res.headers.sid) {
      this.subscriptions[serviceType] = res.headers.sid;
    }
    setTimeout(this.subscribe.bind(this), 120 * 1000, serviceType);
  }.bind(this));
  req.end();
};

WemoClient.prototype._unsubscribeAll = function() {
  for (var serviceType in this.subscriptions) {
    this.unsubscribe(serviceType);
  }
};

// TODO: Refactor the callback handler.
WemoClient.prototype.handleCallback = function(json) {
  var self = this;
  if (json['e:propertyset']['e:property'][0]['StatusChange']) {
    xml2js.parseString(json['e:propertyset']['e:property'][0]['StatusChange'][0], function(err, xml) {
      if (!err && xml) {
        self.emit('statusChange',
          xml.StateEvent.DeviceID[0]._, // device id
          xml.StateEvent.CapabilityId[0], // capability id
          xml.StateEvent.Value[0] // value
        );
      }
    });
  } else if (json['e:propertyset']['e:property'][0]['BinaryState']) {
    self.emit('binaryState',
      json['e:propertyset']['e:property'][0]['BinaryState'][0].substring(0, 1)
    );
  } else if (json['e:propertyset']['e:property'][0]['InsightParams']) {
    var params = json['e:propertyset']['e:property'][0]['InsightParams'][0].split('|');
    var insightParams = {
      ONSince: params[1],
      OnFor: params[2],
      TodayONTime: params[3]
    };
    self.emit('insightParams',
      params[0], // binary state
      params[7], // instant power
      insightParams
    );
  } else if (json['e:propertyset']['e:property'][0]['attributeList']) {
    xml2js.parseString(json['e:propertyset']['e:property'][0]['attributeList'][0], function(err, xml) {
      if (!err && xml) {
        self.emit('attributeList',
          xml.attribute.name[0], // name
          xml.attribute.value[0], // value
          xml.attribute.prevalue[0], // previous value
          xml.attribute.ts[0] // timestamp
        );
      }
    });
  } else {
    debug('Unhandled Event: %j', json);
  }
};

// Based on https://github.com/theycallmeswift/hue.js/blob/master/lib/helpers.js
// TODO: Needs to be tweaked for more accurate color representation
WemoClient.rgb2xy = function(red, green, blue) {
  var xyz;
  var rgb = [red / 255, green / 255, blue / 255];

  for (var i = 0; i < 3; i++) {
    if (rgb[i] > 0.04045) {
      rgb[i] = Math.pow(((rgb[i] + 0.055) / 1.055), 2.4);
    } else {
      rgb[i] /= 12.92;
    }
    rgb[i] = rgb[i] * 100;
  }

  xyz = [
    rgb[0] * 0.4124 + rgb[1] * 0.3576 + rgb[2] * 0.1805,
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722,
    rgb[0] * 0.0193 + rgb[1] * 0.1192 + rgb[2] * 0.9505
  ];

  return [
    xyz[0] / (xyz[0] + xyz[1] + xyz[2]) * 65535,
    xyz[1] / (xyz[0] + xyz[1] + xyz[2]) * 65535
  ];
};
