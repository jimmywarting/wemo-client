# Wemo Client for Node.js

Low-level client library for controlling Wemo Devices. Supports event subscriptions and recent Wemo models like Bridge and Bulb.

## Supported Devices

  * [x] Wemo Light Bulb
  * [x] Wemo Insight Switch
  * [x] Wemo Switch
  * [x] Wemo Motion
  * [ ] Wemo Maker
  * [ ] Osram Lightify TW
  * [ ] Osram Flex RGBW
  * [ ] Osram Gardenspot RGB

## Install

```
$ npm install timonreinhard/wemo-client
```

## Usage

This project is at an early stage and the API is expected to change!

```javascript
var Wemo = require('wemo-client');
var wemo = new Wemo();

wemo.discover(function(deviceInfo){
  console.log('Wemo Device Found: %j', deviceInfo);

  var client = wemo.client(deviceInfo);

  client.on('BinaryState', function(event){
    console.log('Binary State changed: %j', event);
  });

  client.subscribe('urn:Belkin:service:basicevent:1');
  client.setBinaryState(1);
});
```

## Credits

Credit goes to [Ben Hardill](http://www.hardill.me.uk/wordpress/tag/wemo/) for his research on Belkin's Wemo devices.

## License

Published under the [ISC License](https://github.com/timonreinhard/wemo-client/blob/master/LICENSE).
