var Wemo = require('../index');

var wemo = new Wemo();

function foundDevice(deviceInfo){
  console.log('Wemo Device Found: %j', deviceInfo);

  // Get the client for the found device
  var client = wemo.client(deviceInfo);

  // Handle binaryState events
  client.on('binaryState', function(value){
    console.log('Binary State changed: %s', value);
  });

  // Turn the switch on
  client.setBinaryState(1);
}

// Inital discovery
wemo.discover(foundDevice);

// Repeat discovery as some devices may appear late
setInterval(function(){
  wemo.discover(foundDevice);
}, 15000);
