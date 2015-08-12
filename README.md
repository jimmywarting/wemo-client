# Wemo Client for Node.js

Low-level client library for controlling Wemo Devices. Supports event subscriptions and recent Wemo models like Bridge and Bulb.

## Supported Devices

  * [x] Wemo Switch
  * [x] Wemo Motion
  * [x] Wemo Insight Switch
  * [x] Wemo Maker
  * [x] Wemo Light Bulb
  * [ ] Osram Lightify TW
  * [ ] Osram Flex RGBW
  * [ ] Osram Gardenspot RGB

## Install

```
$ npm install wemo-client
```

## Usage

```javascript
var Wemo = require('wemo-client');
var wemo = new Wemo();

wemo.discover(function(deviceInfo) {
  console.log('Wemo Device Found: %j', deviceInfo);

  // Get the client for the found device
  var client = wemo.client(deviceInfo);

  // Handle BinaryState events
  client.on('binaryState', function(value) {
    console.log('Binary State changed to: %s', value);
  });

  // Turn the switch on
  client.setBinaryState(1);
});
```

## API

### Wemo

#### discover(cb)

Discover Wemo devices via UPnP. A `deviceInfo` will be passed to `cb` that can be used to get a client for the device found.

* **Callback** *cb* Callback called for every single device found.

#### client(deviceInfo)

Get a single instance of [WemoClient](#wemoclient) for the device specified by `deviceInfo`.

* **Object** *deviceInfo* The `deviceInfo` as returned by the discovery.

### WemoClient

#### Event: binaryState

Binary state of a device has been updated, e.g. a motion sensor detected motion or a plug is switched on.

* **String** *value* The state of the binary switch/sensor. `1` = on/closed/motion, `0` = off/open/quiet

```javascript
client.on('binaryState', function(value) {
  console.log('Device turned %s', value === '1' ? 'on' : 'off')
});
```

#### Event: statusChange

Capability of a device connected via Wemo Bridge changed its status.

* **String** *deviceId* Id of the device connected to the bridge
* **String** *capabilityId* Capability
* **String** *value* Status

#### Event: attributeList

Attribute of a device has changed. This seems to apply to Wemo Maker only for now.

* **String** *name* Name of the attribute, e.g. `Switch`
* **String** *value* Current value
* **String** *prevalue* Previous value
* **String** *timestamp* Timestamp of the change

#### Event: insightParams

Wemo Insight Switch sent new power consumption data.

* **String** *binaryState* `1` = on, `0` = off, `8` = standby
* **String** *instantPower* Current power consumption in mW
* **Object** *data* Aggregated usage data

#### setBinaryState(value, cb)

Turn the device on or off. Will also cause a `binaryState` event to be triggered.

* **String** *value* `1` = on, `0` = off
* **Callback** *cb* cb(err, data)

#### setDeviceStatus(deviceId, capability, value)

Controls a capability of a device connected via Wemo Bridge, e.g. a bulb.

* **String** *deviceId* Id of the device connected to the bridge
* **String** *capability* Capability
* **String** *value* Value

## Credits

Credit goes to [Ben Hardill](http://www.hardill.me.uk/wordpress/tag/wemo/) for his research on Belkin Wemo devices.

## License

Published under the [ISC License](https://github.com/timonreinhard/wemo-client/blob/master/LICENSE).
