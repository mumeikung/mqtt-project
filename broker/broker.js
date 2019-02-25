const net = require('net')
const UUID = require('uuidv4')

const debug = false

let JNCFList = {}
let topicList = {}

const server = net.createServer((socket) => {
  const socketId = UUID()
  const address = socket.address()
  if (debug) console.log('socket id:', socketId, 'is start')
  if (debug) console.log('address:', address.address, 'port:', address.port, 'family:', address.family)
  const myJNCF = new JNCF(socket, socketId)
  JNCFList[socketId] = myJNCF
  socket.on('data', (buffer) => {
    // debugBuffer(buffer)
    try {
      myJNCF.decode(buffer)
    } catch (error) {
      console.error('decode', error.message)
      socket.destroy()
    }
  })
  socket.on('end', () => {
    if (debug) console.log('end')
    if (debug) console.log('socket id:', socketId, 'is ended')
    myJNCF.END()
  })
  socket.on('close', (error) => {
    if (debug) console.log('close isError:', error)
    if (debug) console.log('socket id:', socketId, 'is closed')
    myJNCF.END()
  })
  socket.on('timeout', () => {
    if (debug) console.log('timeout')
    if (debug) console.log('socket id:', socketId, 'is timeout')
    myJNCF.END()
  })
  socket.on('error', (error) => {
    if (debug) console.error('socket id:', socketId, 'error!')
    console.error('error', error.name, error.message)
    myJNCF.END()
  })
})

server.listen(1883, () => {
  console.log('port 1883 (MQTT) listening')
})

class JNCF {
  constructor (socket = new net.Socket(), uid = '') {
    this.socket = socket
    this.socketId = uid
  }

  decode (buffer = new Buffer()) {
    const byte1 = to8bit(buffer[0])
    const type = parseInt(byte1.substr(0, 4), 2)
    const flags = byte1.substr(4, 4)
    // type 1 3 4 5 7
    if (flags !== '0000') throw new Error('Flag not correct')
    const RemainingLength = parseInt(to8bit(buffer[1]) + to8bit(buffer[2]), 2)
    if (debug) console.log('Remaining Length:', RemainingLength)
    let nextBit = 3
    if (type === 1) { // CONN Type
      if (debug) console.log('Type: CONN')
      const protocolNameLength = buffer[nextBit++]
      if (debug) console.log('Protocol Name Length:', protocolNameLength)
      let protocolName = ''
      for (let i = 0; i < protocolNameLength; i++) {
        protocolName += String.fromCharCode(buffer[nextBit++])
      }
      const protocolVersion = buffer[nextBit++]
      if (debug) console.log('Protocol Name:', protocolName)
      if (debug) console.log('Protocol Version:', protocolVersion)
      if (protocolName !== 'JNCF') throw new Error('Protocol Name not correct')
      if (protocolVersion !== 1) throw new Error('Protocol Level not correct')
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      return this.CONNACK()
    } else if (!this.isConnect) throw new Error('Socket:', this.socketId, 'not connect!!!')
    if (type === 3) { // PUB Type
      if (debug) console.log('Type: PUB')
      const topicLength = buffer[nextBit++]
      if (debug) console.log('Topic Length:', topicLength)
      let topic = ''
      for (let i = 0; i < topicLength; i++) {
        topic += String.fromCharCode(buffer[nextBit++])
      }
      topic = topicFormat(topic)
      if (debug) console.log('Topic:', topic)
      const messageId = to8bit(buffer[nextBit++]) + to8bit(buffer[nextBit++])
      if (debug) console.log('Message ID:', messageId, parseInt(messageId, 2))
      // payload
      let payload = ''
      const payloadLength = RemainingLength - (nextBit - 3)
      if (debug) console.log('Payload Length:', payloadLength)
      for (let i = 0; i < payloadLength; i++) {
        payload += String.fromCharCode(buffer[nextBit++])
      }
      if (debug) console.log('Payload:', payload)
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      console.log(`PUBLISH => TOPIC: "${topic}" => MESSAGE: "${payload}"`)
      this.PUBACK(messageId)
      return pubToSub(topic, payload)
    } else if (type === 4) { // PUBACK
      if (debug) console.log('Type: PUBACK')
      const messageId = parseInt((to8bit(buffer[nextBit++]) + to8bit(buffer[nextBit++])), 2)
      if (debug) console.log('Message ID:', messageId)
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      if (this.messageId) {
        if (this.messageId === messageId) {
          clearInterval(this.loopPUB)
          delete this.loopPUB
          delete this.messageId
          if (debug) console.log('PUBACK Complete')
          return null
        } else throw new Error('Message ID not match')
      } else throw new Error('Message ID not found')
    } else if (type === 5) { // SUB
      if (debug) console.log('Type: SUB')
      const topicLength = buffer[nextBit++]
      if (debug) console.log('Topic Length:', topicLength)
      let topic = ''
      for (let i = 0; i < topicLength; i++) {
        topic += String.fromCharCode(buffer[nextBit++])
      }
      topic = topicFormat(topic)
      if (debug) console.log('Topic:', topic)
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      if (!topicList[topic]) topicList[topic] = {}
      topicList[topic][this.socketId] = true
      this.topic = topic
      return this.SUBACK()
    } else if (type === 7) { // PING
      if (debug) console.log('Type: PING')
      return this.PINGACK()
    }
    throw new Error ('Type not correct')
  }

  CONNACK () {
    if (debug) console.log('CONNACK')
    this.isConnect = true
    const ackHeader = [32, 0, 1, 0]
    if (debug) console.log('===== END =====')
    return this.socket.write(new Buffer(ackHeader))
  }

  PUB (pubData = pubBuffer()) {
    if (debug) console.log('PUB')
    this.waitPUBACK(pubData)
    if (debug) console.log('===== END =====')
    return this.socket.write(pubData.buffer)
  }

  waitPUBACK (pubData = pubBuffer()) {
    this.messageId = pubData.messageId
    this.loopPUB = setInterval(() => {
      this.PUB(pubData)
    }, 10000)
  }

  PUBACK (messageId = '') {
    if (debug) console.log('PUBACK')
    const msgId = ('0000000000000000' + messageId).substr(-16)
    const ackHeader = [64, 0, 2, parseInt(msgId.substr(0, 8), 2), parseInt(msgId.substr(8, 8), 2)]
    if (debug) console.log('===== END =====')
    return this.socket.write(new Buffer(ackHeader))
  }

  SUBACK () {
    if (debug) console.log('SUBACK')
    const ackHeader = [96, 0, 1, 0]
    if (debug) console.log('===== END =====')
    return this.socket.write(new Buffer(ackHeader))
  }

  PINGACK () {
    if (debug) console.log('PINGACK')
    const ackHeader = [128, 0, 0]
    if (debug) console.log('===== END =====')
    return this.socket.write(new Buffer(ackHeader))
  }

  END () {
    if (this.isEnd) return null
    this.isConnect = false
    // this.socket.end()
    if (this.topic) {
      // unset me in topic
      delete topicList[this.topic][this.socketId]
    }
    delete JNCFList[this.socketId]
    this.isEnd = true
    this.socket.destroy()
    if (debug) console.log('===== END SOCKET =====')
  }
}

const pubToSub = (topic = '', payload = '') => {
  const myTopic = topicFormat(topic)
  // const list = topicList[myTopic]
  let list = {}
  for (const key in topicList) {
    if (topicList.hasOwnProperty(key)) {
      if (key.startsWith(myTopic, 0)) {
        const element = topicList[key]
        for (const sid in element) list[sid] = true
      }
    }
  }
  if (list) {
    const pubData = pubBuffer(topic, payload)
    for (const key in list) {
      const thisJNCF = JNCFList[key]
      if (thisJNCF) thisJNCF.PUB(pubData)
    }
  }
}

const to8bit = (number) => {
  return ('00000000' + number.toString(2)).substr(-8)
}

const debugBuffer = (buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    const number = buffer[i]
    const hex = ('00' + number.toString(16)).substr(-2)
    const dec = ('000' + number.toString(10)).substr(-3)
    const bin = to8bit(number)
    const left = parseInt(bin.substr(0, 4), 2)
    const right = parseInt(bin.substr(4, 4), 2)
    let data = 'byte ' + ('00' + (i-2)).substr(-2)
    data += ' => ' + hex + ' ' + dec + ' ' + bin.substr(0, 4) + ' ' + bin.substr(4, 4)
    data += ' => ' + left + ' ' + right
    data += ' => 0x' + left.toString(16) + ' 0x' + right.toString(16)
    data += ' -> ' + String.fromCharCode(buffer[i])
    console.log(data)
  }
}

const topicFormat = (topic = '') => {
  const myTopic = topic.split('/')
  let newTopic = ''
  for (const key in myTopic) {
    if (myTopic.hasOwnProperty(key)) {
      const element = myTopic[key]
      if (element) {
        newTopic += '/' + element
      }
    }
  }
  return (newTopic === '' ? '/' : newTopic)
}

const pubBuffer = (topic = '', payload = '') => {
  let pubData = [48, 0, 0]
  pubData.push(topic.length)
  for (let i = 0; i < topic.length; i++) {
    pubData.push(topic.charCodeAt(i))
  }
  const messageId = ('0000000000000000' + (Math.floor(Math.random() * 65536)).toString(2)).substr(-16)
  pubData.push(parseInt(messageId.substr(0, 8), 2))
  pubData.push(parseInt(messageId.substr(8, 8), 2))
  for (let i = 0; i < payload.length; i++) {
    pubData.push(payload.charCodeAt(i))
  }
  const RemainLength = ('0000000000000000' + (pubData.length - 3).toString(2)).substr(-16)
  pubData[1] = parseInt(RemainLength.substr(0, 8), 2)
  pubData[2] = parseInt(RemainLength.substr(8, 8), 2)
  return {
    buffer: new Buffer(pubData),
    messageId: parseInt(messageId, 2)
  }
}
