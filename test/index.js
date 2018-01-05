var fs = require('fs');
var demand = require('must');
var url = require('url');
var http = require('http');
var Mitm = require('mitm');

var Wemo = require('../index');
var WemoClient = require('../client');
var deviceInfo = require('./fixtures/deviceinfo.json');

/* eslint-env mocha */

describe('Wemo', function() {

  it('must expose a public constructor', function() {
    Wemo.must.be.a.function();
  });

  it('must process notify requests', function(done) {
    var wemo = new Wemo();
    var client = wemo.client(deviceInfo);
    var address = url.parse(wemo.getCallbackURL());
    client.callbackURL = address;

    client.on('binaryState', function(state) {
      state.must.be('1');
      done();
    });

    var req = http.request({
      hostname: address.hostname,
      port: address.port,
      path: '/' + deviceInfo.UDN,
      method: 'NOTIFY'
    });

    req.write(fs.readFileSync(__dirname + '/fixtures/binaryStateEvent.xml'));
    req.end();
  });

  describe('#load(setupUrl, cb, err)', function() {
    it('must load a device', function(done) {
      var wemo = new Wemo();
      var mitm = Mitm();
      mitm.on('request', function(req, res) {
        req.url.must.be('/setup.xml');
        var fixture = fs.readFileSync(__dirname + '/fixtures/setup.xml');
        res.write(fixture);
        res.end();
        mitm.disable();
      });

      wemo.load('http://127.0.0.2/setup.xml', function(err, device) {
        demand(err).must.be.falsy();
        device.serialNumber.must.be('000000000000B');
        done();
      });

    });

    it('must error if no connection can be established', function(done) {
      var wemo = new Wemo();
      var mitm = Mitm();
      mitm.on('request', function(req, res) {
        req.url.must.be('/setup.xml');
        res.statusCode = 404;
        res.write('Failed to connect');
        res.end();
        mitm.disable();
      });

      wemo.load('http://127.0.0.2/setup.xml', function(err) {
        demand(err).not.be.undefined();
        done();
      });
    });
  });

});

describe('WemoClient', function() {

  var client;
  var mitm;

  beforeEach(function() {
    mitm = Mitm();
    client = (new Wemo()).client(deviceInfo);
    client.callbackURL = 'http://localhost';
  });

  afterEach(function() {
    mitm.disable();
  });

  describe('Event: binaryState', function() {
    it('must emit binaryState events', function(done) {
      client.on('binaryState', function(state) {
        state.must.be('1');
        done();
      });
      var fixture = fs.readFileSync(__dirname + '/fixtures/binaryStateEvent.xml');
      client.handleCallback(fixture);
    });
  });

  describe('Event: brightness', function() {
    it('must emit brightness events', function(done) {
      client.on('brightness', function(brightness) {
        brightness.must.be(13);
        done();
      });
      var fixture = fs.readFileSync(__dirname + '/fixtures/brightnessEvent.xml');
      client.handleCallback(fixture);
    });
  });

  describe('Event: statusChange', function() {
    it('must emit statusChange events', function(done) {
      client.on('statusChange', function(deviceId, capabilityId, value) {
        deviceId.must.be('1432253402');
        capabilityId.must.be('10008');
        value.must.be('65:0');
        done();
      });
      var fixture = fs.readFileSync(__dirname + '/fixtures/statusChangeEvent.xml');
      client.handleCallback(fixture);
    });
  });

  describe('Event: insightParams', function() {
    it('must emit insightParams events', function(done) {
      client.on('insightParams', function(binaryState, instantPower, data) {
        binaryState.must.be('8');
        instantPower.must.be('410');
        data.must.have.property('ONSince', '1450460139');
        data.must.have.property('OnFor', '6511');
        data.must.have.property('TodayONTime', '0');
        data.must.have.property('TodayConsumed', '551366');
        done();
      });
      var fixture = fs.readFileSync(__dirname + '/fixtures/insightParamsEvent.xml');
      client.handleCallback(fixture);
    });
  });

  describe('Event: attributeList', function() {
    it('must emit attributeList events', function(done) {
      var event = [];
      client.on('attributeList', function(name, value, prevalue, ts) {
        event.push({
          name: name,
          value: value,
          prevalue: prevalue,
          ts: ts
        });
        if (event.length == 2) {
          event[0].name.must.be('Switch');
          event[0].value.must.be('1');
          event[0].prevalue.must.be('0');
          event[0].ts.must.be('1450733524');
          event[1].name.must.be('Sensor');
          event[1].value.must.be('0');
          event[1].prevalue.must.be('1');
          event[1].ts.must.be('1450733524');
          done();
        }
      });
      var fixture = fs.readFileSync(__dirname + '/fixtures/attributeListEvent.xml');
      client.handleCallback(fixture);
    });
  });

  describe('#soapAction(serviceType, action, body, cb)', function() {
    it('must use the correct endpoint', function(done) {
      mitm.on('request', function(req, res) {
        req.url.must.be('/upnp/control/deviceinfo1');
        req.method.must.be('POST');
        res.statusCode = 200;
        res.end();
      });
      client.soapAction('urn:Belkin:service:deviceinfo:1', 'TheAction', { TheBody: 'Foo' }, done);
    });

    it('must send a soap header', function(done) {
      mitm.on('request', function(req, res) {
        req.headers.soapaction.must.be('"urn:Belkin:service:deviceinfo:1#TheAction"');
        res.statusCode = 200;
        res.end();
      });
      client.soapAction('urn:Belkin:service:deviceinfo:1', 'TheAction', { TheBody: 'Foo' }, done);
    });

    it('must send a valid body', function(done) {
      mitm.on('request', function(req, res) {
        req.setEncoding('utf8');
        req.on('data', function(data) {
          data.must.contain('<u:TheAction xmlns:u="urn:Belkin:service:deviceinfo:1">');
          data.must.contain('<TheBody>Foo</TheBody>');
          done();
        });
      });
      client.soapAction('urn:Belkin:service:deviceinfo:1', 'TheAction', { TheBody: 'Foo' });
    });
  });

  describe('#setBinaryState(val)', function() {
    it('must send a BinaryState action', function(done) {
      mitm.on('request', function(req, res) {
        req.setEncoding('utf8');
        req.url.must.equal('/upnp/control/basicevent1');
        req.on('data', function(data) {
          data.must.contain('<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">');
          data.must.contain('<BinaryState>1</BinaryState>');
          done();
        });
      });
      client.setBinaryState(1);
    });
  });

  describe('#getBinaryState(cb)', function() {
    it('must callback with a binaryState value', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getBinaryState.xml');
        res.write(fixture);
        res.end();
      });
      client.getBinaryState(function(err, binaryState) {
        demand(err).to.be.falsy();
        binaryState.must.be('1');
        done();
      });
    });
  });

  describe('#setBrightness(val)', function() {
    it('must send a BinaryState action', function(done) {
      mitm.on('request', function(req) {
        req.setEncoding('utf8');
        req.url.must.equal('/upnp/control/basicevent1');
        req.on('data', function(data) {
          data.must.contain('<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">');
          data.must.contain('<BinaryState>1</BinaryState>');
          data.must.contain('<brightness>50</brightness>');
          done();
        });
      });
      client.setBrightness(50);
    });

    it('sets BinaryState to 0 if brightness is 0', function(done) {
      mitm.on('request', function(req) {
        req.setEncoding('utf8');
        req.url.must.equal('/upnp/control/basicevent1');
        req.on('data', function(data) {
          data.must.contain('<u:SetBinaryState xmlns:u="urn:Belkin:service:basicevent:1">');
          data.must.contain('<BinaryState>0</BinaryState>');
          data.must.contain('<brightness>0</brightness>');
          done();
        });
      });
      client.setBrightness(0);
    });
  });

  describe('#getBrightness(cb)', function() {
    it('must callback with a brightness value', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getBinaryState.xml');
        res.write(fixture);
        res.end();
      });
      client.getBrightness(function(err, brightness) {
        demand(err).to.be.falsy();
        brightness.must.be(42);
        done();
      });
    });
  });

  describe('#getAttributes(cb)', function() {
    it('must callback with device attributes', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getAttributes.xml');
        res.write(fixture);
        res.end();
      });
      client.getAttributes(function(err, attributes) {
        demand(err).to.be.falsy();
        attributes.must.have.property('Switch', '0');
        attributes.must.have.property('Sensor', '1');
        attributes.must.have.property('SwitchMode', '0');
        attributes.must.have.property('SensorPresent', '1');
        done();
      });
    });
  });

  describe('#getDeviceStatus(deviceId, cb)', function() {
    it('must callback with a deviceStatus', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getDeviceStatus.xml');
        res.write(fixture);
        res.end();
      });
      client.getDeviceStatus('1432253402', function(err, deviceStatus) {
        demand(err).to.be.falsy();
        deviceStatus.must.have.property('10006', '1');
        deviceStatus.must.have.property('10008', '65:0');
        deviceStatus.must.have.property('30008', '0:0');
        deviceStatus.must.have.property('30009', '');
        deviceStatus.must.have.property('3000A', '');
        done();
      });
    });
  });

  describe('#setDeviceStatus(deviceId, capabilityId, cb)', function() {
    it('must send a DeviceStatus action', function(done) {
      mitm.on('request', function(req, res) {
        req.setEncoding('utf8');
        req.url.must.equal('/upnp/control/bridge1');
        res.statusCode = 200;
        req.on('data', function(data) {
          data.must.contain('<u:SetDeviceStatus xmlns:u="urn:Belkin:service:bridge:1">');
          data.must.contain('<DeviceStatusList>');
          data.must.contain('&lt;IsGroupAction&gt;YES&lt;/IsGroupAction&gt;');
          data.must.contain('&lt;DeviceID&gt;1432253402&lt;/DeviceID&gt;');
          data.must.contain('&lt;CapabilityID&gt;10006&lt;/CapabilityID&gt;');
          data.must.contain('&lt;CapabilityValue&gt;1&lt;/CapabilityValue&gt;');
          done();
        });
      });
      client.setDeviceStatus('1432253402', '10006', '1');
    });
  });

  describe('#setLightColor(deviceId, r, g, b, cb)', function() {
    it('must send a DeviceStatus action', function(done) {
      mitm.on('request', function(req, res) {
        req.setEncoding('utf8');
        req.url.must.equal('/upnp/control/bridge1');
        res.statusCode = 200;
        req.on('data', function(data) {
          data.must.contain('&lt;DeviceID&gt;1432253402&lt;/DeviceID&gt;');
          data.must.contain('&lt;CapabilityID&gt;10300&lt;/CapabilityID&gt;');
          data.must.contain('&lt;CapabilityValue&gt;45968:17936:0&lt;/CapabilityValue&gt;');
          done();
        });
      });
      client.setLightColor('1432253402', 255, 0, 0);
    });
  });

  describe('#getEndDevices(err, cb)', function() {
    it('must handle grouped bulbs', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getEndDevices_group.xml');
        res.write(fixture);
        res.end();
      });
      client.getEndDevices(function(err, endDevices) {
        demand(err).to.be.falsy();
        demand(endDevices).to.be.an.array();
        demand(endDevices).to.have.length(2);
        endDevices[0].friendlyName.must.be('First');
        endDevices[1].friendlyName.must.be('Second');
        endDevices[0].deviceType.must.be('colorLight');
        endDevices[1].deviceType.must.be('dimmableLight');
        done();
      });
    });

    it('must handle single bulbs', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getEndDevices_single.xml');
        res.write(fixture);
        res.end();
      });
      client.getEndDevices(function(err, endDevices) {
        demand(err).to.be.falsy();
        demand(endDevices).to.be.an.array();
        demand(endDevices).to.have.length(2);
        endDevices[0].friendlyName.must.be('First');
        endDevices[1].friendlyName.must.be('Second');
        endDevices[0].deviceType.must.be('dimmableLight');
        endDevices[1].deviceType.must.be('colorLight');
        done();
      });
    });
  });

  describe('#getInsightParams(cb)', function() {
    it('must callback with an insightParams value', function(done) {
      mitm.on('request', function(req, res) {
        var fixture = fs.readFileSync(__dirname + '/fixtures/getInsightParams.xml');
        res.write(fixture);
        res.end();
      });
      client.getInsightParams(function(err, binaryState, instantPower, data) {
        demand(err).to.be.falsy();
        binaryState.must.be('8');
        instantPower.must.be('410');
        data.must.have.property('ONSince', '1450460139');
        data.must.have.property('OnFor', '6511');
        data.must.have.property('TodayONTime', '0');
        data.must.have.property('TodayConsumed', '551366');
        done();
      });
    });
  });

  describe('#on(binaryState)', function() {
    it('must send a event subscription request', function(done) {
      mitm.on('request', function(req, res) {
        req.url.must.equal('/upnp/event/basicevent1');
        req.method.must.be('SUBSCRIBE');
        req.headers.callback.must.be('<http://foo.bar:8080/uuid:Socket-1_0-000000000000B>');
        res.statusCode = 200;
        res.setHeader('sid', 'SubscriptionId');
        res.end();
        done();
      });
      client.callbackURL = 'http://foo.bar:8080';
      client.on('binaryState', function() {});
      // will fail when this causes another subscription request - it must not.
      client.on('binaryState', function() {});
    });
  });

  describe('#rgb2xy(r, g, b)', function() {
    it('must transform rgb to xy', function() {
      WemoClient.rgb2xy(255, 0, 0).must.eql([45968, 17936]);
      WemoClient.rgb2xy(0, 255, 0).must.eql([19661, 39321]);
      WemoClient.rgb2xy(0, 0, 255).must.eql([9830, 3932]);
      WemoClient.rgb2xy(247, 241, 45).must.eql([28131, 28033]);
    });
  });

});
