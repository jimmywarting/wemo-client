# Wemo Client for Node.js

Low-level client library for controlling recent Wemo devices including Bulbs. Supports event subscriptions to get live updates from devices.

[![Build Status](https://travis-ci.org/timonreinhard/wemo-client.svg?branch=master)](https://travis-ci.org/timonreinhard/wemo-client)
[![codecov](https://codecov.io/gh/timonreinhard/wemo-client/branch/master/graph/badge.svg)](https://codecov.io/gh/timonreinhard/wemo-client)

## Supported Devices

  * Wemo Switch
  * Wemo Motion
  * Wemo Insight Switch
  * Wemo Maker
  * Wemo Humidifier
  * Wemo Heater
  * Wemo Link
    * Wemo LED Bulb
    * OSRAM Lightify Flex RGBW
    * OSRAM Lightify Tunable White (untested)
    * OSRAM Gardenspot Mini RGB (untested)
  * Wemo Light Switch
  * Wemo Dimmer

## Install

```bash
$ npm install wemo-client
```

## Usage

```javascript
var Wemo = require('wemo-client');
var wemo = new Wemo();

wemo.discover(function(err, deviceInfo) {
  console.log('Wemo Device Found: %j', deviceInfo);

  // Get the client for the found device
  var client = wemo.client(deviceInfo);

  // You definitely want to listen to error events (e.g. device went offline),
  // Node will throw them as an exception if they are left unhandled  
  client.on('error', function(err) {
    console.log('Error: %s', err.code);
  });

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

#### new Wemo([opts])

Create the Wemo instance. An optional object containing options can be specified. Available options include `port` which will provide a port to bind to for listening to UPnP events (the default is to listen on any available randomly selected port.) Discovery options for `node-ssdp` can also be specified as `discover_opts`. The `listen_interface` option can be used to specify which network interface to listen on.  If `listen_interface` is not specified then by default the server will listen on all interfaces, however, Wemo subscription messages will only be sent to the first non-internal IPv4 address returned by `os.networkInterfaces()` after being sorted by compatible network which may or may not be what you want.

Example of options:

```
{
  port: 1234,
  discover_opts: {
    unicastBindPort: 1235
  },
  listen_interface: 'wlan0'
}
```

* **Object** *options* Options

#### DEVICE_TYPE

Static map of supported models and device types.

* Bridge
* Switch
* Motion
* Maker
* Insight
* LightSwitch
* Dimmer
* Humidifier
* HeaterB

#### discover(cb)

Discover Wemo devices via UPnP. A `deviceInfo` will be passed to `cb` that can be used to get a client for the device found.

* **Callback** *cb* Callback called with for every single device found.

Due to the nature of UPnP it may be required to call this method multiple times to discover actually all devices connected to the local network.

The callback will only be called for newly found devices (those that have not been detected by a previous call to `discover`). Except for devices that have been lost in an error state as those will reappear again when coming back online (e.g. because their IP/port have changed).

#### load(setupUrl, cb)

*API breaking in: v0.13*

Allows to skip discovery if the `setupUrl` of a Wemo is already known. A `deviceInfo` will be passed to `cb` that can be used to get a client for the device found. The `err` field will be non-null in the event of an error.

* **String** *setupUrl* Must point to setup.xml of the requested device (`http://device_ip:device_port/setup.xml`).
* **Callback** *cb* cb(err, deviceInfo)

#### client(deviceInfo)

Get a single instance of [WemoClient](#wemoclient) for the device specified by `deviceInfo`.

* **Object** *deviceInfo* The `deviceInfo` as returned by the discovery.

### WemoClient

#### Event: error (err)

An error occured while handling the event subscriptions or calling a device action.
When `err.code` is one of `ECONNREFUSED`, `EHOSTUNREACH` or `ETIMEDOUT` the device
likely went offline.

* **Object** *err*

_When using any subscriptions, make sure to also listen to `error` events. Node will **throw** an exception if error events are left unhandled. See also: [Building Robust Node Applications: Error Handling](https://strongloop.com/strongblog/robust-node-applications-error-handling/)_

#### Event: binaryState (value)

Binary state of a device has been updated, e.g. a motion sensor detected motion or a plug is switched on.

* **String** *value* The state of the binary switch/sensor. `1` = on/closed/motion, `0` = off/open/quiet

```javascript
client.on('binaryState', function(value) {
  console.log('Device turned %s', value === '1' ? 'on' : 'off');
});
```

#### Event: statusChange (deviceId, capabilityId, value)

Capability of a device connected via Wemo Bridge changed its status.

* **String** *deviceId* Id of the device connected to the bridge
* **String** *capabilityId* Capability
* **String** *value* Status

#### Event: attributeList (name, value, prevalue, timestamp)

Attribute of a device has changed. This applies to Wemo Maker, Wemo Humidifier, and Wemo Heater (may not be exhaustive).

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
  deviceId: 'EA103EA2B2782FFF',
  capabilities: {
    '10006': '1',
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

#### getBrightness(cb)

Get the device's brightness level (0 - 100).

* **Callback** *cb* cb(err, brightness)

The callback is passed the brightness level (0 - 100).

#### setBrightness(value, [cb])

Set the device brightness level. Will also cause a `binaryState` event to be triggered.

* **Integer** *value* 1 - 100
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

#### getInsightParams(cb)

Get power consumption data for a Wemo Insight Switch

* **Callback** *cb* cb(err, binaryState, instantPower, data)

The callback is passed the `binaryState`, `instantPower` and `data` (see [Event: InsightParams](#event-insightparams-binarystate-instantpower-data))

#### setAttributes(attributes, cb)

Sets attributes on a device (Heater, Humidifier), used for setting FanMode, Mode, TimeRemaining, and SetTemperature (not exhaustive) to a value.

* **Object** *attributes*
```javascript
{
  "SetTemperature": "73.0",
  "TimeRemaining": "120"
}
```

You can set any number of attributes in this manner, and if you do not specify an attribute, it is left unchanged on the device.

* **Callback** *cb* cb(err, returnValue)

The callback is passed the `returnValue`, which is what the device returned for that SOAP call.



## Debugging

Wemo Client uses [debug](https://github.com/visionmedia/debug), so just run with environmental variable `DEBUG` set to `wemo-client`.

```bash
$ env DEBUG=wemo-client node examples/index.js
```
## Known Issues

There are some quirks and oddities to be aware of when working with the devices supported by this library.

### General

* The `deviceInfo` returned from the discovery may contain a device state property (e.g. `binaryState`) which has an outdated value most of the time. Just don't use it.

### Wemo Link

* The `capabilities` property of the `endDeviceInfo` may represent outdated values. Please use the `getDeviceStatus` method or subscribe to `statusChange` events to obtain the current state of the device.

* Setting capability `10008` (level/brightness) to `> 0` will turn the light on, but won't update capability `10006` (on/off). In other words, a light turned on by dimming it, will still be reported as off by the `deviceStatus`.

* Setting capability `10008` to `0` will turn the light off, but won't cause _any update_ of the `deviceStatus`. That is the light will still be reported as on and dimmed.

## Contributing

Contributions are very welcome! Please note that by submitting a pull request for this project, you agree to license your contribution under the [MIT License](LICENSE) to this project.

## Credits

Credit goes to [Ben Hardill](http://www.hardill.me.uk/wordpress/tag/wemo/) for his research on Belkin Wemo devices.

## License

Published under the [MIT License](LICENSE).
