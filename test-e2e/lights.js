var demand = require('must');

var Wemo = require('../index');
var WemoClient = require('../client');

/* eslint-env mocha */
describe('Lights', function() {
  var wemo = new Wemo();
  var dimmableLight;
  var colorLight;

  before(function(done) {
    this.timeout(10000);
    var complete = done;
    wemo.discover(function(deviceInfo) {
      if (deviceInfo.deviceType === Wemo.DEVICE_TYPE.Bridge) {
        var client = this.client(deviceInfo);
        client.getEndDevices(function(err, endDevices) {
          if (!err) {
            endDevices.forEach(function(endDevice) {
              if (endDevice.deviceType === 'dimmableLight') {
                dimmableLight = {
                  deviceInfo: deviceInfo,
                  endDevice: endDevice
                };
              }
              if (endDevice.deviceType === 'colorLight') {
                colorLight = {
                  deviceInfo: deviceInfo,
                  endDevice: endDevice
                };
              }
            });
            complete();
            complete = function() {};
          }
        });
      }
    });
  });

  describe('Dimmable Light', function() {
    var client;
    var deviceId;
    var initialState;

    before(function(done) {
      if (!dimmableLight) this.skip();
      client = wemo.client(dimmableLight.deviceInfo);
      deviceId = dimmableLight.endDevice.deviceId;
      client.getDeviceStatus(deviceId, function(err, deviceStatus) {
        demand(err).to.be.falsy();
        initialState = deviceStatus;
        done();
      });
    });

    it('should be dimmable', function(done) {
      var value = Math.floor(Math.random() * 255);
      client.setDeviceStatus(deviceId, 10008, value + ':0', function() {
        client.getDeviceStatus(deviceId, function(err, deviceStatus) {
          demand(err).to.be.falsy();
          deviceStatus.must.have.property('10008', value + ':0');
          done();
        });
      });
    });

    it('should turn on and off', function(done) {
      var value = (initialState['10006'][0] === '1') ? '0' : '1';
      client.setDeviceStatus(deviceId, 10006, value, function() {
        client.getDeviceStatus(deviceId, function(err, deviceStatus) {
          demand(err).to.be.falsy();
          deviceStatus.must.have.property('10006', value);
          done();
        });
      });
    });
  });

  describe('Color Light', function() {
    var client;
    var deviceId;
    var initialState;

    before(function(done) {
      if (!colorLight) this.skip();
      client = wemo.client(colorLight.deviceInfo);
      deviceId = colorLight.endDevice.deviceId;
      client.getDeviceStatus(deviceId, function(err, deviceStatus) {
        demand(err).to.be.falsy();
        initialState = deviceStatus;
        done();
      });
    });

    it('should be dimmable', function(done) {
      var value = Math.floor(Math.random() * 255);
      client.setDeviceStatus(deviceId, 10008, value + ':0', function() {
        client.getDeviceStatus(deviceId, function(err, deviceStatus) {
          demand(err).to.be.falsy();
          deviceStatus.must.have.property('10008', value + ':0');
          done();
        });
      });
    });

    it('should change color', function(done) {
      var r = Math.floor(Math.random() * 255);
      var g = Math.floor(Math.random() * 255);
      var b = Math.floor(Math.random() * 255);
      var xy = WemoClient.rgb2xy(r, g, b).join(':');

      client.setDeviceStatus(deviceId, 10300, xy + ':0', function() {
        client.getDeviceStatus(deviceId, function(err, deviceStatus) {
          demand(err).to.be.falsy();
          deviceStatus.must.have.property('10300', xy + ':0');
          done();
        });
      });
    });

    it('should turn on and off', function(done) {
      var value = (initialState['10006'][0] === '1') ? '0' : '1';
      client.setDeviceStatus(deviceId, 10006, value, function() {
        client.getDeviceStatus(deviceId, function(err, deviceStatus) {
          demand(err).to.be.falsy();
          deviceStatus.must.have.property('10006', value);
          done();
        });
      });
    });

  });

});
