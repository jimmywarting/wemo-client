# Wemo Client for Node.js

Low-level client library for controlling recent Wemo devices including Bulbs. Supports event subscriptions to get live updates from devices.

[![Build Status](https://travis-ci.org/timonreinhard/wemo-client.svg?branch=master)](https://travis-ci.org/timonreinhard/wemo-client)
[![Code Climate](https://codeclimate.com/github/timonreinhard/wemo-client/badges/gpa.svg)](https://codeclimate.com/github/timonreinhard/wemo-client)
[![Test Coverage](https://codeclimate.com/github/timonreinhard/wemo-client/badges/coverage.svg)](https://codeclimate.com/github/timonreinhard/wemo-client/coverage)
[![Npm](https://img.shields.io/npm/v/wemo-client.svg)](http://npmjs.com/package/wemo-client)

## Supported Devices

  * Wemo Switch
  * Wemo Motion
  * Wemo Insight Switch
  * Wemo Maker
  * Wemo Link
    * Wemo LED Bulb
    * OSRAM Lightify Flex RGBW
    * OSRAM Lightify Tunable White (untested)
    * OSRAM Gardenspot Mini RGB (untested)
  * Wemo Light Switch

## Install

```bash
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

#### DEVICE_TYPE

Static map of supported models and device types.

* Bridge
* Switch
* Motion
* Maker
* Insight
* LightSwitch

#### discover(cb)

Discover Wemo devices via UPnP. A `deviceInfo` will be passed to `cb` that can be used to get a client for the device found.

* **Callback** *cb* Callback called with for every single device found.

#### load(setupUrl, cb)

Allows to skip discovery if the `setupUrl` of a Wemo is already known. A `deviceInfo` will be passed to `cb` that can be used to get a client for the device found.

* **String** *setupUrl* Must point to setup.xml of the requested device (`http://device_ip:device_port/setup.xml`).
* **Callback** *cb*

#### client(deviceInfo)

Get a single instance of [WemoClient](#wemoclient) for the device specified by `deviceInfo`.

* **Object** *deviceInfo* The `deviceInfo` as returned by the discovery.

### WemoClient

#### Event: binaryState (value)

Binary state of a device has been updated, e.g. a motion sensor detected motion or a plug is switched on.

* **String** *value* The state of the binary switch/sensor. `1` = on/closed/motion, `0` = off/open/quiet

```javascript
client.on('binaryState', function(value) {
  console.log('Device turned %s', value === '1' ? 'on' : 'off')
});
```

#### Event: statusChange (deviceId, capabilityId, value)

Capability of a device connected via Wemo Bridge changed its status.

* **String** *deviceId* Id of the device connected to the bridge
* **String** *capabilityId* Capability
* **String** *value* Status

#### Event: attributeList (name, value, prevalue, timestamp)

Attribute of a device has changed. This seems to apply to Wemo Maker only for now.

* **String** *name* Name of the attribute, e.g. `Switch`
* **String** *value* Current value
* **String** *prevalue* Previous value
* **String** *timestamp* Timestamp of the change

#### Event: insightParams (binaryState, instantPower, data)

Wemo Insight Switch sent new power consumption data.

* **String** *binaryState* `1` = on, `0` = off, `8` = standby
* **String** *instantPower* Current power consumption in mW
* **Object** *data* Aggregated usage data

#### getEndDevices(cb)

Get bulbs connected to a Wemo Bridge. An `endDeviceInfo` for every device paired is passed to the callback in an array, e.g.:
```javascript
[{
  friendlyName: 'Color Bulb',
  deviceId: 'EA103EA2B2782FFF'
  capabilities: {
    '10006': '1'
    '10008': '121:0'
  },
  deviceType: 'dimmableLight'
}]
```

Device groups are treated as if they were single devices – a sole `endDeviceInfo` is returned per group.

*Notice:* The `capabilities` property may represent outdated values due to some odd behavior of the device API. Please refer to [getDeviceStatus](#getdevicestatusdeviceid-cb) or [Event: statusChange](#event-statuschange-deviceid-capabilityid-value) to obtain the current state of the device.

* **Callback** *cb* cb(err, endDeviceInfos)

#### getBinaryState(cb)

Get the device's binary state.

* **Callback** *cb* cb(err, state)

The callback is passed the `state` (`1` = on, `0` = off).

#### setBinaryState(value, [cb])

Turn the device on or off. Will also cause a `binaryState` event to be triggered.

* **String** *value* `1` = on, `0` = off
* **Callback** *cb* cb(err, response)

#### getAttributes(cb)

Get the device attributes of a Wemo Maker.

* **Callback** *cb* cb(err, attributes)

#### getDeviceStatus(deviceId, cb)

Gets the device Status of a device connected via Wemo Bridge, e.g. a bulb.

* **String** *deviceId* Id of the device connected to the bridge (determined by calling [getEndDevices](#getenddevicescb))
* **Callback** *cb* cb(err, deviceStatus)

The callback is passed the `deviceStatus` which is a map of device capabilities and values, e.g.:
```javascript
{
  '10006': '1', // on = 1, off = 0, offline = empty
  '10008': '121:0', // brightness 0-255
  '30008': '0:0', // no sleep timer active
  '30009': '', // unknown
  '3000A': '' // unknown
}
```

#### setDeviceStatus(deviceId, capability, value, [cb])

Controls a capability of a device connected via Wemo Bridge, e.g. a bulb.

* **String** *deviceId* Id of the device connected to the bridge (determined by calling [getEndDevices](#getenddevicescb))
* **String** *capability* Capability
* **String** *value* Value
* **Callback** *cb* cb(err, response)

Known capabilities (depends on device):

* **10006** Turn bulb on/off. Values: `1` = on, `0` = off
* **10008** Dim bulb. Value: `brightness:transition_time`, where `brightness` = 0-255
* **30008** Sleep timer. Value: `seconds*10:current_unixtime`
* **10300** Color. Value: `X:Y:transistion_time`
* **30301** Color Temperature. Value: `ct:transition_time`, where `ct` = 170-370

#### setLightColor(deviceId, red, green, blue, [cb])

Convenience function for setting the color of a RGB light.

* **String** *deviceId* Id of the light connected to the bridge (determined by calling [getEndDevices](#getenddevicescb))
* **Number** *red* 0-255
* **Number** *green* 0-255
* **Number** *blue* 0-255
* **Callback** *cb* cb(err, response)

## Debugging

Wemo Client uses [debug](https://github.com/visionmedia/debug), so just run with environmental variable `DEBUG` set to `wemo-client`.

```bash
$ env DEBUG=wemo-client node examples/index.js
```

## Contributing

Contributions are very welcome! Please note that by submitting a pull request for this project, you agree to license your contribution under the [MIT License](https://github.com/timonreinhard/wemo-client/blob/master/LICENSE) to this project.

## Credits

Credit goes to [Ben Hardill](http://www.hardill.me.uk/wordpress/tag/wemo/) for his research on Belkin Wemo devices.

## License

Published under the [MIT License](https://github.com/timonreinhard/wemo-client/blob/master/LICENSE).
