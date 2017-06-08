var Wemo = require('../index');
var wemo = new Wemo();

function foundDevice(err, device) {
  if (device.deviceType === Wemo.DEVICE_TYPE.LightSwitch) {
    console.log('Wemo Light Switch found: %s', device.friendlyName);

    var state = 'off';
    var client = this.client(device);

    // The switch changed its state
    client.on('binaryState', function(value) {
      state = (value === '1') ? 'on' : 'off';
      console.log('Light Switch %s is %s', this.device.friendlyName, state);
    });

    // Toggle the switch every two seconds
    setInterval(function() {
      client.setBinaryState(state === 'on' ? 0 : 1);
    }, 2000);

  }
}

wemo.discover(foundDevice);
