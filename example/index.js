var Wemo = require('../index');

var wemo = new Wemo();

function foundDevice(device){
  console.log('Wemo Device Found: %j', device);
  var client = this.client(device);

  client.on('BinaryState', function(event){
    console.log('Binary State: %j', event);
  });

  client.subscribe('urn:Belkin:service:basicevent:1');
  client.setBinaryState(1);
}

// Inital discovery
wemo.discover(foundDevice);

// Repeat discovery as some devices may appear late
setInterval(function(){
  wemo.discover(foundDevice);
}, 15000);
