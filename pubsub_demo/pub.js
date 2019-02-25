#!/usr/bin/env node
'use strict'

const net = require('net')
const PromiseSocket = require('promise-socket')

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

const to8bit = (number) => {
  return ('00000000' + number.toString(2)).substr(-8)
}

const ADDR = process.argv[2] || 'localhost'
const TOPIC = process.argv[3] || '/'
const MSG = process.argv[4] || ''

const newSoc = new net.Socket()
const socket = new PromiseSocket(newSoc)

const runn = async () => {
  try {
    await socket.connect(1883, ADDR)
    await socket.write(new Buffer([16, 0, 6, 4, 74, 78, 67, 70, 1]))
    const conn = await socket.read()
    console.log('conn', conn)
    if (conn[0] !== 32 && conn[0] !== 0 && conn[0] !== 1 && conn[0] !== 0) throw new Error('CONNACK not correct')
    const pubData = pubBuffer(TOPIC, MSG)
    console.log('MSG ID:', pubData.messageId)
    await socket.write(pubData.buffer)
    const ack = await socket.read()
    console.log('ack content', ack)
    // [64, 0, 2, parseInt(msgId.substr(0, 8), 2), parseInt(msgId.substr(8, 8), 2)]
    if (ack[0] !== 64 && ack[1] !== 0 && ack[2] !== 2) throw new Error('PUBACK not correct')
    const getMessageID = parseInt((to8bit(ack[3]) + to8bit(ack[4])), 2)
    console.log('GET MSG ID:', getMessageID)
    if (pubData.messageId !== getMessageID) throw new Error('Message ID not match')
    console.log('PUB SUCCESS')
    await socket.end()
  } catch (error) {
    console.error(error.message)
    await socket.end()
  }
}
runn()
