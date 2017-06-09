var Wemo = require('../index');
var wemo = new Wemo();

function foundDevice(err, deviceInfo) {
  if (deviceInfo.deviceType === Wemo.DEVICE_TYPE.HeaterB) {
    console.log('Wemo HeaterB found: %s', deviceInfo.friendlyName);

    // Get the client for the found device
    var client = wemo.client(deviceInfo);

    client.getAttributes(function(err, attributes) {
      console.log("Attributes for heater: ", attributes);
    });

    /*
    client.setAttributes({ "SetTemperature": "72.0", "TimeRemaining": "120" }, function(err, retval) {
      console.log("Look I just set the temperature to 72.0 using NodeJS");
    });
    */
    // Handle attributeList events
    client.on('attributeList', function(key, value) {
      console.log(key, " has changed to ", value);
    });
  }
}

// Inital discovery
wemo.discover(foundDevice);

// Repeat discovery as some devices may appear late
setInterval(function() {
  wemo.discover(foundDevice);
}, 15000);
