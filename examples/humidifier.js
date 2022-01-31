const Wemo = require('../index.js')
const wemo = new Wemo()

function foundDevice (err, deviceInfo) {
  if (deviceInfo.deviceType === Wemo.DEVICE_TYPE.Humidifier) {
    console.log('Wemo Humidifier found: %s', deviceInfo.friendlyName)

    // Get the client for the found device
    const client = wemo.client(deviceInfo)

    client.getAttributes((err, attributes) => {
      console.log('Attributes for humidifier: ', attributes)
    })

    // Handle attributeList events
    client.on('attributeList', (key, value) => {
      console.log(key, ' has changed to ', value)
    })
  }
}

// Inital discovery
wemo.discover(foundDevice)

// Repeat discovery as some devices may appear late
setInterval(function () {
  wemo.discover(foundDevice)
}, 15000)
