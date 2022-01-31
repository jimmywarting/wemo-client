const Wemo = require('../index.js')
const wemo = new Wemo()

function foundDevice (err, device) {
  if (device.deviceType === Wemo.DEVICE_TYPE.Switch) {
    console.log('Wemo Switch found: %s', device.friendlyName)

    let state = 'off'
    const client = this.client(device)

    // The switch changed its state
    client.on('binaryState', function (value) {
      state = (value === '1') ? 'on' : 'off'
      console.log('Switch %s is %s', this.device.friendlyName, state)
    })

    // Toggle the switch every two seconds
    setInterval(function () {
      client.setBinaryState(state === 'on' ? 0 : 1)
    }, 2000)
  }
}

wemo.discover(foundDevice)
