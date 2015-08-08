var Wemo = require('../index');

var wemo = new Wemo();

function foundDevice(device){
  if (device.deviceType === 'urn:Belkin:device:Maker:1') {
    console.log('Wemo Maker found: %s', device.friendlyName);

    var client = this.client(device);
    client.on('AttributeList', function(event){
      console.log('AttributeList for %s changed: %j', this.device.friendlyName, event);
    });

    client.subscribe('urn:Belkin:service:basicevent:1');

    // Close the switch after 3 seconds
    setTimeout(function(){
      client.setBinaryState(1);
    }, 3 * 1000);
  }

}

wemo.discover(foundDevice);
