var Wemo = require('../index');

var wemo = new Wemo();
wemo.discover(function(device){
  var client = this.client(device);
  client.on('BinaryState', function(event){
    console.log(event);
  });
  client.subscribe('urn:Belkin:service:basicevent:1');
  client.setBinaryState(1);
});

//setInterval(wemo.discover, 5000);
