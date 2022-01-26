const http = require('http')
const EventEmitter = require('events')
const {promisify} = require('util')

const xml2js = require('xml2js')
const entities = require('entities')
const debugFactory = require('debug')
const xmlbuilder = require('xmlbuilder')
const universalify = require('./frompromise.js')

const debug = debugFactory('wemo-client')

/** @type {(str, opts) => Promise} */
const parseXml = promisify(xml2js.parseString)

function mapCapabilities (capabilityIds, capabilityValues) {
  const ids = capabilityIds.split(',')
  const values = capabilityValues.split(',')
  const result = {}
  ids.forEach((val, index) => {
    result[val] = values[index]
  })
  return result
}

class WemoClient extends EventEmitter {
  subscriptions = {}
  error

  constructor (config) {
    super()

    this.host = config.host
    this.port = config.port
    this.deviceType = config.deviceType
    this.UDN = config.UDN
    this.callbackURL = config.callbackURL
    this.device = config

    // Create map of services
    config.serviceList.service.forEach(function (service) {
      this[service.serviceType] = {
        serviceId: service.serviceId,
        controlURL: service.controlURL,
        eventSubURL: service.eventSubURL
      }
    }, this.services = {})

    // Transparently subscribe to serviceType events
    // TODO: Unsubscribe from ServiceType when all listeners have been removed.
    this.on('newListener', this._onListenerAdded)
  }

  async soapAction (serviceType, action, body) {
    this._verifyServiceSupport(serviceType)

    const xml = xmlbuilder.create('s:Envelope', {
      version: '1.0',
      encoding: 'utf-8',
      allowEmpty: true
    })
      .att('xmlns:s', 'http://schemas.xmlsoap.org/soap/envelope/')
      .att('s:encodingStyle', 'http://schemas.xmlsoap.org/soap/encoding/')
      .ele('s:Body')
      .ele('u:' + action)
      .att('xmlns:u', serviceType)

    const payload = (body ? xml.ele(body) : xml).end()

    const options = {
      host: this.host,
      port: this.port,
      path: this.services[serviceType].controlURL,
      method: 'POST',
      headers: {
        SOAPACTION: '"' + serviceType + '#' + action + '"',
        'Content-Type': 'text/xml; charset="utf-8"'
      }
    }

    const response = await WemoClient.request(options, payload).catch(err => {
      this.error = err.code
      this.emit('error', err)
      throw err
    })

    return response && response['s:Envelope']['s:Body'][`u:${action}Response`]
  }

  async getEndDevices () {
    const parseDeviceInfo = function (data) {
      const device = {}

      if (data.GroupID) {
        // treat device group as it was a single device
        device.friendlyName = data.GroupName[0]
        device.deviceId = data.GroupID[0]
        device.capabilities = mapCapabilities(
          data.GroupCapabilityIDs[0],
          data.GroupCapabilityValues[0]
        )
      } else {
        // single device
        device.friendlyName = data.FriendlyName[0]
        device.deviceId = data.DeviceID[0]
        device.capabilities = mapCapabilities(
          data.CapabilityIDs[0],
          data.CurrentState[0]
        )
      }

      // set device type
      if (device.capabilities.hasOwnProperty('10008')) {
        device.deviceType = 'dimmableLight'
      }
      if (device.capabilities.hasOwnProperty('10300')) {
        device.deviceType = 'colorLight'
      }

      return device
    }

    const data = await this.soapAction('urn:Belkin:service:bridge:1', 'GetEndDevices', {
      DevUDN: this.UDN,
      ReqListType: 'PAIRED_LIST'
    })

    debug('endDevices raw data', data)
    const endDevices = []

    const result = await parseXml(data.DeviceLists)
    const deviceInfos = result.DeviceLists.DeviceList[0].DeviceInfos[0].DeviceInfo

    if (deviceInfos) {
      endDevices.push(...deviceInfos.map(parseDeviceInfo))
    }

    if (result.DeviceLists.DeviceList[0].GroupInfos) {
      const groupInfos = result.DeviceLists.DeviceList[0].GroupInfos[0].GroupInfo
      endDevices.push(...groupInfos.map(parseDeviceInfo))
    }

    return endDevices
  }

  async setDeviceStatus (deviceId, capability, value) {
    const deviceStatusList = xmlbuilder.create('DeviceStatus', {
      version: '1.0',
      encoding: 'utf-8'
    }).ele({
      IsGroupAction: (deviceId.length === 10) ? 'YES' : 'NO',
      DeviceID: deviceId,
      CapabilityID: capability,
      CapabilityValue: value
    }).end()

    return this.soapAction('urn:Belkin:service:bridge:1', 'SetDeviceStatus', {
      DeviceStatusList: { '#text': deviceStatusList }
    })
  }

  async getDeviceStatus (deviceId) {
    const data = await this.soapAction('urn:Belkin:service:bridge:1', 'GetDeviceStatus', {
      DeviceIDs: deviceId
    })
    const result = await parseXml(data.DeviceStatusList, { explicitArray: false })
    const deviceStatus = result.DeviceStatusList.DeviceStatus
    const capabilities = mapCapabilities(deviceStatus.CapabilityID, deviceStatus.CapabilityValue)
    return capabilities
  }

  async setLightColor (deviceId, red, green, blue) {
    const color = WemoClient.rgb2xy(red, green, blue)
    return this.setDeviceStatus(deviceId, 10300, color.join(':') + ':0')
  }

  async setBinaryState (value) {
    return this.soapAction('urn:Belkin:service:basicevent:1', 'SetBinaryState', {
      BinaryState: value
    })
  }

  async getBinaryState () {
    const {BinaryState} = await this.soapAction('urn:Belkin:service:basicevent:1', 'GetBinaryState', null)
    return BinaryState
  }

  async setBrightness (brightness) {
    return this.soapAction('urn:Belkin:service:basicevent:1', 'SetBinaryState', {
      BinaryState: brightness <= 0 ? 0 : 1,
      brightness
    })
  }

  async getBrightness () {
    const { brightness } = await this.soapAction('urn:Belkin:service:basicevent:1', 'GetBinaryState', null)
    return parseInt(brightness)
  }

  async setAttributes (attributes) {
    const builder = new xml2js.Builder({ rootName: 'attribute', headless: true, renderOpts: { pretty: false } })

    const xml_attributes = Object.keys(attributes).map((attribute_key) => {
      return builder.buildObject({ name: attribute_key, value: attributes[attribute_key] })
    }).join('')

    return this.soapAction('urn:Belkin:service:deviceevent:1', 'SetAttributes', {
      attributeList: {
        '#text': xml_attributes
      }
    })
  }

  async getAttributes () {
    const data = await this.soapAction('urn:Belkin:service:deviceevent:1', 'GetAttributes', null)
    const xml = '<attributeList>' + entities.decodeXML(data.attributeList) + '</attributeList>'
    const result = await parseXml(xml, { explicitArray: false })
    const attributes = {}
    for (const key in result.attributeList.attribute) {
      const attribute = result.attributeList.attribute[key]
      attributes[attribute.name] = attribute.value
    }
    return attributes
  }

  async getInsightParams (cb) {
    const data = await this.soapAction('urn:Belkin:service:insight:1', 'GetInsightParams', null).catch(err => {
      cb(err)
      throw err
    })
    const params = this._parseInsightParams(data.InsightParams)
    cb(null, params.binaryState, params.instantPower, params.insightParams)
    return params
  }

  _parseInsightParams (paramsStr) {
    const params = paramsStr.split('|')

    return {
      binaryState: params[0],
      instantPower: params[7],
      insightParams: {
        ONSince: params[1],
        OnFor: params[2],
        TodayONTime: params[3],
        TodayConsumed: params[8] // power consumer today (mW per minute)
      }
    }
  }

  _onListenerAdded (eventName) {
    const serviceType = WemoClient.EventServices[eventName]
    if (serviceType && this.services[serviceType]) {
      this._subscribe(serviceType)
    }
  }

  _subscribe (serviceType) {
    this._verifyServiceSupport(serviceType)

    if (!this.callbackURL) {
      throw new Error('Can not subscribe without callbackURL')
    }
    if (this.subscriptions[serviceType] && this.subscriptions[serviceType] === 'PENDING') {
      debug('subscription still pending')
      return
    }

    const options = {
      host: this.host,
      port: this.port,
      path: this.services[serviceType].eventSubURL,
      method: 'SUBSCRIBE',
      headers: {
        TIMEOUT: 'Second-300'
      }
    }

    if (!this.subscriptions[serviceType]) {
      // Initial subscription
      this.subscriptions[serviceType] = 'PENDING'
      debug('Initial subscription - Device: %s, Service: %s', this.UDN, serviceType)
      options.headers.CALLBACK = '<' + this.callbackURL + '/' + this.UDN + '>'
      options.headers.NT = 'upnp:event'
    } else {
      // Subscription renewal
      debug('Renewing subscription - Device: %s, Service: %s', this.UDN, serviceType)
      options.headers.SID = this.subscriptions[serviceType]
    }

    const req = http.request(options, res => {
      if (res.statusCode === 200) {
        // Renew after 150 seconds
        this.subscriptions[serviceType] = res.headers.sid
        setTimeout(this._subscribe.bind(this), 150 * 1000, serviceType)
      } else {
        // Try to recover from failed subscription after 2 seconds
        debug('Subscription request failed with HTTP %s', res.statusCode)
        this.subscriptions[serviceType] = null
        setTimeout(this._subscribe.bind(this), 2000, serviceType)
      }
    })

    req.on('error', (err) => {
      debug('Subscription error: %s - Device: %s, Service: %s', err.code, this.UDN, serviceType)
      this.subscriptions[serviceType] = null
      this.error = err.code
      this.emit('error', err)
    })

    req.end()
  }

  _verifyServiceSupport (serviceType) {
    if (!this.services[serviceType]) {
      throw new Error('Service ' + serviceType + ' not supported by ' + this.UDN)
    }
  }

  handleCallback (body) {
    const handler = {
      BinaryState: data => {
        this.emit('binaryState', data.substring(0, 1))
      },
      Brightness: data => {
        this.emit('brightness', parseInt(data))
      },
      StatusChange: data => {
        xml2js.parseString(data, { explicitArray: false }, (err, xml) => {
          if (!err) {
            this.emit('statusChange',
              xml.StateEvent.DeviceID._,
              xml.StateEvent.CapabilityId,
              xml.StateEvent.Value
            )
          }
        })
      },
      InsightParams: data => {
        const params = this._parseInsightParams(data)
        this.emit('insightParams', params.binaryState, params.instantPower, params.insightParams)
      },
      attributeList: data => {
        const xml = '<attributeList>' + entities.decodeXML(data) + '</attributeList>'
        xml2js.parseString(xml, { explicitArray: true }, (err, result) => {
          if (!err) {
            // In order to keep the existing event signature this
            // triggers an event for every attribute changed.
            result.attributeList.attribute.forEach((attribute) => {
              this.emit('attributeList',
                attribute.name[0],
                attribute.value[0],
                attribute.prevalue[0],
                attribute.ts[0]
              )
            })
          }
        })
      }
    }

    xml2js.parseString(body, { explicitArray: false }, function (err, xml) {
      if (err) { throw err }
      for (const prop in xml['e:propertyset']['e:property']) {
        if (handler.hasOwnProperty(prop)) {
          handler[prop](xml['e:propertyset']['e:property'][prop])
        } else {
          debug('Unhandled Event: %s', prop)
        }
      }
    })
  }

  static async request (options, data) {
    const body = await new Promise((rs, rj) => {
      const req = http.request(options, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('error', rj)
        res.on('data', chunk => { body += chunk })
        res.on('end', () => res.statusCode === 200
          ? rs(body)
          : rj(new Error('HTTP ' + res.statusCode + ': ' + body))
        )
      })
      req.on('error', rj)
      if (data) req.write(data)
      req.end()
    })
    return parseXml(body, { explicitArray: false })
  }

  static rgb2xy (r, g, b) {
    // Based on: https://github.com/aleroddepaz/pyhue/blob/master/src/pyhue.py
    const X = (0.545053 * r) + (0.357580 * g) + (0.180423 * b)
    const Y = (0.212671 * r) + (0.715160 * g) + (0.072169 * b)
    const Z = (0.019334 * r) + (0.119193 * g) + (0.950227 * b)

    const x = X / (X + Y + Z)
    const y = Y / (X + Y + Z)

    return [
      Math.round(x * 65535),
      Math.round(y * 65535)
    ]
  }
}

WemoClient.EventServices = {
  insightParams: 'urn:Belkin:service:insight:1',
  statusChange: 'urn:Belkin:service:bridge:1',
  attributeList: 'urn:Belkin:service:basicevent:1',
  binaryState: 'urn:Belkin:service:basicevent:1'
}


for (let x of ['request'])
  WemoClient[x] = universalify(WemoClient[x])

for (let x of [
  'getAttributes',
  'getBinaryState',
  'getBrightness',
  'getDeviceStatus',
  'getEndDevices',
  'setAttributes',
  'setBinaryState',
  'setDeviceStatus',
  'setLightColor',
  'soapAction'
])
  WemoClient.prototype[x] = universalify(WemoClient.prototype[x])

module.exports = WemoClient
