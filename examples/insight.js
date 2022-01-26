const Wemo = require('../index.js')
const wemo = new Wemo()

function foundDevice (err, device) {
  if (device.deviceType === Wemo.DEVICE_TYPE.Insight) {
    console.log('Wemo Insight Switch found: %s', device.friendlyName)

    const client = this.client(device)
    client.on('insightParams', function (state, power) {
      console.log('%s’s power consumption: %s W',
        this.device.friendlyName,
        Math.round(power / 1000)
      )
    })
  }
}

wemo.discover(foundDevice)
