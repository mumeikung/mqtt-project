#!/usr/bin/env node
'use strict'

const net = require('net')
const UUID = require('uuidv4')

const arg0 = process.argv[2] || ''

const debug = (arg0 === '--debug')

let JNCFList = {}
let topicList = {}
let PUBACKcount = {}

const server = net.createServer((socket) => {
  const socketId = UUID()
  const address = socket.address()
  if (debug) console.log('socket id:', socketId, 'is start')
  if (debug) console.log('address:', address.address, 'port:', address.port, 'family:', address.family)
  const myJNCF = new JNCF(socket, socketId)
  JNCFList[socketId] = myJNCF
  socket.on('data', (buffer = Buffer.from([])) => {
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
  if (debug) console.log('Debug mode on')
})

class JNCF {
  constructor (socket = new net.Socket(), uid = '') {
    this.socket = socket
    this.socketId = uid
    this.pubStack = {}
  }

  decode (buffer = Buffer.from([])) {
    if (debug) console.log('Decoding', this.socketId)
    if (debug) console.log(buffer)
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
    }
    else if (!this.isConnect) throw new Error('Socket: ' + this.socketId + 'not connect!!!')

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
      if (!topic) throw new Error('Incorrect topic format')
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
      console.log(`BROKER => TOPIC: "${topic}" => MESSAGE: "${payload}"`)
      this.PUBACK(messageId)
      this.isPub = true
      return pubToSub(topic, payload)
    }
    
    else if (type === 4) { // PUBACK
      if (debug) console.log('Type: PUBACK')
      const messageId = parseInt((to8bit(buffer[nextBit++]) + to8bit(buffer[nextBit++])), 2)
      if (debug) console.log('Message ID:', messageId)
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      for (const key in this.pubStack) {
        if (this.pubStack.hasOwnProperty(key)) {
          const pubData = this.pubStack[key]
          if (key === ('m' + messageId)) {
            clearTimeout(pubData.time)
            delete this.pubStack[key]
            if (PUBACKcount[key] > 1) PUBACKcount[key] -= 1
            else delete PUBACKcount[key]
            if (debug) console.log('PUBACK Complete')
            if (debug) console.log('===== PUBACK END =====')
            return null
          }
        }
      }
      throw new Error('Message ID not match')
    }
    
    else if (type === 5) { // SUB
      if (debug) console.log('Type: SUB')
      const topicLength = buffer[nextBit++]
      if (debug) console.log('Topic Length:', topicLength)
      let topic = ''
      for (let i = 0; i < topicLength; i++) {
        topic += String.fromCharCode(buffer[nextBit++])
      }
      topic = topicFormat(topic)
      if (debug) console.log('Topic:', topic)
      if (!topic) throw new Error('Incorrect topic format')
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      if (!topicList[topic]) topicList[topic] = {}
      topicList[topic][this.socketId] = true
      this.topic = topic
      console.log(this.socketId, 'start subscribe Topic:', topic)
      this.isSub = true
      return this.SUBACK()
    }
    
    else if (type === 7) { // PING
      if (debug) console.log('Type: PING')
      return this.PINGACK()
    }
    
    else if (type === 9) { // DISCONN
      if (debug) console.log('Type: DISCONN')
      return this.END()
    }
    
    throw new Error ('Type not correct')
  }

  CONNACK () {
    if (!this.CHECKSOCKET()) return null
    if (debug) console.log('CONNACK', this.socketId)
    this.isConnect = true
    const ackHeader = [32, 0, 1, 0]
    if (debug) console.log('===== CONNACK END =====')
    return this.socket.write(Buffer.from(ackHeader))
  }

  PUB (pubData = pubBuffer()) {
    if (!this.CHECKSOCKET()) return null
    const msgId = 'm' + pubData.messageId
    if (!this.pubStack[msgId]) this.pubStack[msgId] = { count: 0 }
    this.pubStack[msgId].count += 1
    if (this.pubStack[msgId].count > 3) {
      console.log(this.socketId, 'not response PUBACK...')
      if (this.pubStack[msgId].time) clearTimeout(this.pubStack[msgId].time)
      delete this.pubStack[msgId]
      this.END()
      return null
    }
    if (debug) console.log('PUB', this.socketId)
    if (debug) console.log('Message ID:', pubData.messageId, '(' + this.pubStack[msgId].count + ')')
    this.waitPUBACK(pubData)
    if (debug) console.log('===== PUB END =====')
    return this.socket.write(pubData.buffer)
  }

  waitPUBACK (pubData = pubBuffer()) {
    const msgId = 'm' + pubData.messageId
    if (this.pubStack[msgId].time) clearTimeout(this.pubStack[msgId].time)
    this.pubStack[msgId].time = setTimeout(() => {
      this.PUB(pubData)
    }, 10000)
  }

  PUBACK (messageId = '') {
    if (!this.CHECKSOCKET()) return null
    if (debug) console.log('PUBACK', this.socketId)
    const msgId = ('0000000000000000' + messageId).substr(-16)
    const ackHeader = [64, 0, 2, parseInt(msgId.substr(0, 8), 2), parseInt(msgId.substr(8, 8), 2)]
    if (debug) console.log('===== PUBACK END =====')
    return this.socket.write(Buffer.from(ackHeader))
  }

  SUBACK () {
    if (!this.CHECKSOCKET()) return null
    if (debug) console.log('SUBACK', this.socketId)
    const ackHeader = [96, 0, 1, 0]
    if (debug) console.log('===== SUBACK END =====')
    return this.socket.write(Buffer.from(ackHeader))
  }

  PINGACK () {
    if (!this.CHECKSOCKET()) return null
    if (debug) console.log('PINGACK', this.socketId)
    const ackHeader = [128, 0, 0]
    if (debug) console.log('===== PINGACK END =====')
    return this.socket.write(Buffer.from(ackHeader))
  }

  END () {
    if (this.isEnd) return null
    this.isConnect = false
    for (const key in this.pubStack) {
      if (this.pubStack.hasOwnProperty(key)) {
        const element = this.pubStack[key]
        if (element.time) clearTimeout(element.time)
      }
    }
    this.pubStack = {}
    if (this.topic) {
      // unset me in topic
      delete topicList[this.topic][this.socketId]
    }
    delete JNCFList[this.socketId]
    this.isEnd = true
    if (this.isSub) console.log(this.socketId, 'stop subscribe Topic:', this.topic)
    if (!this.socket.destroyed) this.socket.end(Buffer.from([144, 0, 0]))
    if (debug) console.log('===== END SOCKET =====')
  }

  CHECKSOCKET () {
    if (this.socket.destroyed || this.isEnd) {
      console.error('Socket Destroyed!')
      this.END()
      return false
    }
    return true
  }
}

const pubToSub = (topic = '', payload = '') => {
  const myTopic = topicFormat(topic)
  let list = {}
  for (const key in topicList) {
    if (topicList.hasOwnProperty(key)) {
      if (topicMatchCheck(myTopic, key)) {
        const element = topicList[key]
        for (const sid in element) list[sid] = true
      }
    }
  }
  if (list) {
    let pubData = pubBuffer(topic, payload)
    while(PUBACKcount['m' + pubData.messageId]) pubData = pubBuffer(topic, payload)
    const msgId = 'm' + pubData.messageId
    PUBACKcount[msgId] = 0
    for (const key in list) {
      const thisJNCF = JNCFList[key]
      if (thisJNCF) {
        PUBACKcount[msgId] += 1
        thisJNCF.PUB(pubData)
      }
    }
  }
}

const topicMatchCheck = (topic = '', target = '') => {
  topic += '/'
  target += '/'
  const topicRes = new RegExp(replaceRegExp(topic))
  const targetRes = new RegExp(replaceRegExp(target))
  return (topicRes.test(target) || targetRes.test(topic))
}

const replaceRegExp = (text = '') => {
  return '^' + text.replace(/\+/g, '[^/]+').replace('#/', '.+') + '$'
}

const to8bit = (number = 0) => {
  return ('00000000' + number.toString(2)).substr(-8)
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
  if (newTopic === '') return null
  if (newTopic.indexOf('#') >= 0 && newTopic.indexOf('#') !== (newTopic.length - 1)) return null
  if (newTopic.charAt(newTopic.length - 1) === '#') {
    if (newTopic.charAt(newTopic.length - 2) !== '/') return null
  }
  if (newTopic.charAt(newTopic.length - 1) === '+') {
    if (newTopic.charAt(newTopic.length - 2) !== '/') return null
  }
  return newTopic
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
    buffer: Buffer.from(pubData),
    messageId: parseInt(messageId, 2)
  }
}
