const url = require('url')
const http = require('http')
const os = require('os')

const { Client: SSDPClient } = require('node-ssdp')
const ip = require('ip')
const debugFactory = require('debug')

const WemoClient = require('./client.js')
const universalify = require('./frompromise.js')

const debug = debugFactory('wemo-client')

class Wemo {
  #port = 0
  #listenInterface
  /** @type {Map<string, WemoClient>} */
  #clients = new Map()
  #ssdpClient
  #server

  constructor (opts = {}) {
    this.#port = opts.port || 0
    this.#listenInterface = opts.listen_interface

    this._listen()
    this.#ssdpClient = new SSDPClient(opts.discover_opts || {})
  }

  async load (setupUrl) {
    const location = url.parse(setupUrl)

    const json = await WemoClient.request({
      method: 'GET',
      host: location.hostname,
      port: location.port,
      path: location.path,
    })

    const device = json.root.device
    device.host = location.hostname
    device.port = location.port
    device.callbackURL = this.getCallbackURL({
      clientHostname: location.hostname
    })

    // Return devices only once!
    if (!this.#clients.has(device.UDN) || this.#clients.get(device.UDN).error) {
      debug('Found device: %j', json)
      return device
    }
  }

  discover (cb) {
    const handleResponse = (msg, statusCode, rinfo) => {
      if (msg.ST && msg.ST === 'urn:Belkin:service:basicevent:1') {
        this.load(msg.LOCATION).then(cb)
      }
    }

    this.#ssdpClient.removeAllListeners('response')
    this.#ssdpClient.on('response', handleResponse)
    this.#ssdpClient.search('urn:Belkin:service:basicevent:1')
  }

  _listen () {
    const serverCallback = err => {
      if (err) {
        throw err
      }
    }

    this.#server = http.createServer(this._handleRequest.bind(this))

    this.#listenInterface
      ? this.#server.listen(this.#port, this.getLocalInterfaceAddress(), serverCallback)
      : this.#server.listen(this.#port, serverCallback)
  }

  _handleRequest (req, res) {
    let body = ''
    const udn = req.url.substring(1)

    if (req.method == 'NOTIFY' && this.#clients.get(udn)) {
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => {
        debug('Incoming Request for %s: %s', udn, body)
        this.#clients.get(udn).handleCallback(body)
        res.writeHead(204)
        res.end()
      })
    } else {
      debug('Received request for unknown device: %s', udn)
      res.writeHead(404)
      res.end()
    }
  }

  getLocalInterfaceAddress (targetNetwork) {
    let interfaces = os.networkInterfaces()
    if (this.#listenInterface) {
      if (interfaces[this.#listenInterface]) {
        interfaces = [interfaces[this.#listenInterface]]
      } else {
        throw new Error('Unable to find interface ' + this.#listenInterface)
      }
    }
    const addresses = []
    for (const k in interfaces) {
      for (const k2 in interfaces[k]) {
        const address = interfaces[k][k2]
        if (address.family === 'IPv4' && !address.internal) {
          if (targetNetwork && ip.subnet(address.address, address.netmask).contains(targetNetwork)) {
            addresses.unshift(address.address)
          } else {
            addresses.push(address.address)
          }
        }
      }
    }
    return addresses.shift()
  }

  getCallbackURL (opts = {}) {
    if (!this._callbackURL) {
      const port = this.#server.address().port
      const host = this.getLocalInterfaceAddress(opts.clientHostname)
      this._callbackURL = `http://${host}:${port}`
    }
    return this._callbackURL
  }

  client (device) {
    if (this.#clients[device.UDN] && !this.#clients[device.UDN].error) {
      return this.#clients.get(device.UDN)
    }

    const client = new WemoClient(device)
    this.#clients.set(device.UDN, client)
    return client
  }
}

Wemo.DEVICE_TYPE = {
  Bridge: 'urn:Belkin:device:bridge:1',
  Switch: 'urn:Belkin:device:controllee:1',
  Motion: 'urn:Belkin:device:sensor:1',
  Maker: 'urn:Belkin:device:Maker:1',
  Insight: 'urn:Belkin:device:insight:1',
  LightSwitch: 'urn:Belkin:device:lightswitch:1',
  Dimmer: 'urn:Belkin:device:dimmer:1',
  Humidifier: 'urn:Belkin:device:Humidifier:1',
  HeaterB: 'urn:Belkin:device:HeaterB:1'
}

Wemo.prototype.load = universalify(Wemo.prototype.load)

module.exports = Wemo
