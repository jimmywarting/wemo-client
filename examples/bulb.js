const Wemo = require('../index.js')
const wemo = new Wemo()

// Dim the bulb to a random value
function dimBulb (client, device) {
  setInterval(function () {
    const value = Math.floor(Math.random() * 255)
    console.log('Dim bulb %s to %d', device.friendlyName, value)
    client.setDeviceStatus(device.deviceId, 10008, value + ':10')
  }, 3000)
}

function foundDevice (err, deviceInfo) {
  if (deviceInfo.deviceType === Wemo.DEVICE_TYPE.Bridge) {
    console.log('Wemo Bridge found: %s', deviceInfo.friendlyName)

    const client = this.client(deviceInfo)
    client.getEndDevices(function (err, endDevices) {
      if (!err) {
        console.log('Bulbs found: %j', endDevices)
        endDevices.forEach(function (endDevice) {
          dimBulb(client, endDevice)
        })
      }
    })
  }
}

// Inital discovery
wemo.discover(foundDevice)
