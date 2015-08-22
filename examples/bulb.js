var Wemo = require('../index');
var wemo = new Wemo();

function foundDevice(deviceInfo) {
  if (deviceInfo.deviceType === 'urn:Belkin:device:bridge:1') {
    console.log('Wemo Bridge found: %s', deviceInfo.friendlyName);

    var client = this.client(deviceInfo);
    client.getEndDevices(function(err, endDevices) {
      if (!err) {
        console.log('Bulbs found: %j', endDevices);
      }
    });
  }
};

// Inital discovery
wemo.discover(foundDevice);
